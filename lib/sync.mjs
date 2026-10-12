// Device sync for My kitchen and Saved: the merge rules. Pure functions, no
// I/O, shared by the API route, the client and scripts/test-sync.mjs.
//
// How it works, in short:
// - Linked devices share one "space" on the server holding a sync doc.
// - Every value in the doc carries the time it last changed. Deleting keeps
//   the entry with present = 0 (a "tombstone"), so a removal reaches the other
//   devices instead of the old value coming back from them.
// - Merging two docs keeps, for every value separately, the newer one. So two
//   devices can change different things at the same time and both changes
//   survive; only when both change the very same thing does the later win.
// - A device finds its own changes by comparing what it shows now with the
//   doc from its last sync (stamp), sends them, and shows the merged result.
//
// Doc shape (v 1). Keys are null-prototype dicts; times are ms since epoch.
//   pool:    { slug: [present, ts] }
//   fav:     { slug: [present, addedAt, ts] }
//   folders: { id: { on: [present, ts], look: [name, emoji, color, ts],
//                    created, items: { slug: [present, addedAt, ts] } } }
//   order:   [[folderId, ...], ts]

import { isValidSlug } from "./nearby.mjs";
import * as F from "./folders.mjs";
import {
  DEFAULT_FOLDER_COLOR,
  DEFAULT_FOLDER_EMOJI,
  DEFAULT_FOLDER_NAME,
  MAX_FOLDERS,
  MAX_FOLDER_ITEMS,
} from "./storage-migrations.mjs";

export const SYNC_DOC_VERSION = 1;
export const MAX_SYNC_BYTES = 1024 * 1024;
export const SYNC_TTL_S = 400 * 24 * 60 * 60; // a space nobody synced for this long is gone
export const TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000;
export const PAIR_TTL_S = 10 * 60;
export const SYNC_EVERY_MS = 20000; // while the app is on screen
export const SYNC_DEBOUNCE_MS = 800; // after a change here
export const SYNC_RETRY_MS = 30000; // after a failed request
const MAX_ENTRIES = 20000; // per dict, way above anything real
const SPACE_RE = /^[A-Za-z0-9_-]{22}$/;
const FOLDER_ID_RE = /^[A-Za-z0-9_-]{1,32}$/;
const CODE_RE = /^\d{6}$/;

const dict = () => Object.create(null);
const tsOf = (e) => e[e.length - 1];
const isTs = (n) => Number.isSafeInteger(n) && n >= 0;
const isFlag = (n) => n === 0 || n === 1;

export function isValidSpace(s) {
  return typeof s === "string" && SPACE_RE.test(s);
}

export function isValidCode(s) {
  return typeof s === "string" && CODE_RE.test(s);
}

/** A new random space id (22 url-safe chars, 128+ bits). */
export function newSpaceId() {
  const bytes = new Uint8Array(17);
  globalThis.crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
    .slice(0, 22);
}

/** A random 6 digit pairing code. */
export function newPairCode() {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return String(buf[0] % 1000000).padStart(6, "0");
}

export function emptyDoc() {
  return { v: SYNC_DOC_VERSION, pool: dict(), fav: dict(), folders: dict(), order: [[], 0] };
}

// ---------------------------------------------------------------------------
// Doc -> what the app shows

const byAddedDesc = (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);

/**
 * The app state a doc stands for: { pool: Set, favorites: Map, folders: [] }
 * in the store's runtime shapes. Pool keeps the order recipes were added,
 * favorites go oldest first, folders follow `order` (folders missing from it,
 * e.g. just made on another device, go first, newest first) and are capped
 * like everywhere else.
 */
export function materialize(doc) {
  const pool = new Set(
    Object.entries(doc.pool)
      .filter(([, e]) => e[0] === 1)
      .sort((a, b) => a[1][1] - b[1][1] || (a[0] < b[0] ? -1 : 1))
      .map(([s]) => s),
  );
  const favorites = new Map(
    Object.entries(doc.fav)
      .filter(([, e]) => e[0] === 1)
      .map(([s, e]) => [s, e[1]])
      .sort((a, b) => -byAddedDesc(a, b)),
  );
  const present = Object.entries(doc.folders).filter(([, f]) => f.on[0] === 1);
  const ids = new Set(present.map(([id]) => id));
  const ordered = [];
  const placed = new Set();
  for (const id of doc.order[0]) {
    if (ids.has(id) && !placed.has(id)) {
      placed.add(id);
      ordered.push(id);
    }
  }
  const missing = present
    .filter(([id]) => !placed.has(id))
    .sort((a, b) => b[1].created - a[1].created || (a[0] < b[0] ? -1 : 1))
    .map(([id]) => id);
  const folders = [...missing, ...ordered].slice(0, MAX_FOLDERS).map((id) => {
    const f = doc.folders[id];
    const items = Object.entries(f.items)
      .filter(([, e]) => e[0] === 1)
      .map(([s, e]) => [s, e[1]])
      .sort(byAddedDesc)
      .slice(0, MAX_FOLDER_ITEMS);
    let updatedAt = Math.max(tsOf(f.on), tsOf(f.look), f.created);
    for (const e of Object.values(f.items)) updatedAt = Math.max(updatedAt, tsOf(e));
    return {
      id,
      name: f.look[0],
      emoji: f.look[1],
      color: f.look[2],
      createdAt: f.created,
      updatedAt,
      items: items.map(([slug, addedAt]) => ({ slug, addedAt })),
    };
  });
  return { pool, favorites, folders };
}

// ---------------------------------------------------------------------------
// What changed here since the last sync

function shallowDoc(doc) {
  const out = emptyDoc();
  Object.assign(out.pool, doc.pool);
  Object.assign(out.fav, doc.fav);
  Object.assign(out.folders, doc.folders);
  out.order = doc.order;
  return out;
}

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Compares the app state `local` ({ pool, favorites, folders } as in the
 * store) with what `base` (the doc from the last sync) shows, and returns
 * { doc, changed }: `base` with every difference stamped at `now`. Values
 * the app cannot show (beyond the folder caps) are left alone, so a cap never
 * turns into a deletion. Recipe slugs or folder ids the server would refuse
 * are skipped.
 */
export function stamp(local, base, now) {
  const view = materialize(base);
  const doc = shallowDoc(base);
  let changed = false;

  for (const slug of local.pool) {
    if (!view.pool.has(slug) && isValidSlug(slug)) {
      doc.pool[slug] = [1, now];
      changed = true;
    }
  }
  for (const slug of view.pool) {
    if (!local.pool.has(slug)) {
      doc.pool[slug] = [0, now];
      changed = true;
    }
  }

  for (const [slug, addedAt] of local.favorites) {
    if (view.favorites.get(slug) !== addedAt && isValidSlug(slug) && isTs(addedAt)) {
      doc.fav[slug] = [1, addedAt, now];
      changed = true;
    }
  }
  for (const [slug, addedAt] of view.favorites) {
    if (!local.favorites.has(slug)) {
      doc.fav[slug] = [0, addedAt, now];
      changed = true;
    }
  }

  const viewFolders = new Map(view.folders.map((f) => [f.id, f]));
  const localIds = new Set();
  for (const f of local.folders) {
    if (!FOLDER_ID_RE.test(f.id)) continue;
    localIds.add(f.id);
    const b = base.folders[f.id];
    const shown = viewFolders.get(f.id);
    let next = b || null;
    const edit = () => {
      if (next === b) next = { ...b, items: b ? Object.assign(dict(), b.items) : dict() };
      changed = true;
    };
    if (!b) {
      next = {
        on: [1, now],
        look: [f.name, f.emoji, f.color, now],
        created: isTs(f.createdAt) ? f.createdAt : now,
        items: dict(),
      };
      changed = true;
    } else {
      if (!shown) {
        edit();
        next.on = [1, now];
      }
      if (b.look[0] !== f.name || b.look[1] !== f.emoji || b.look[2] !== f.color) {
        edit();
        next.look = [f.name, f.emoji, f.color, now];
      }
    }
    // Items: compare with what this folder showed (a hidden folder shows none).
    const shownItems = new Map((shown?.items || []).map((i) => [i.slug, i.addedAt]));
    const localItems = new Set();
    for (const { slug, addedAt } of f.items) {
      localItems.add(slug);
      if (shownItems.get(slug) === addedAt || !isValidSlug(slug) || !isTs(addedAt)) continue;
      const cur = next.items[slug];
      if (!shown && cur && cur[0] === 1 && cur[1] === addedAt) continue;
      edit();
      next.items[slug] = [1, addedAt, now];
    }
    for (const [slug, addedAt] of shownItems) {
      if (localItems.has(slug)) continue;
      edit();
      next.items[slug] = [0, addedAt, now];
    }
    doc.folders[f.id] = next;
  }
  for (const f of view.folders) {
    if (localIds.has(f.id)) continue;
    const b = base.folders[f.id];
    doc.folders[f.id] = { ...b, on: [0, now] };
    changed = true;
  }

  const localOrder = local.folders.map((f) => f.id).filter((id) => localIds.has(id));
  if (!sameList(localOrder, view.folders.map((f) => f.id))) {
    doc.order = [localOrder, now];
    changed = true;
  }
  return { doc, changed };
}

// ---------------------------------------------------------------------------
// Merge

// The newer of two entries; equal times pick one by content, so every device
// picks the same.
function newer(x, y) {
  if (!x) return y;
  if (!y) return x;
  const tx = tsOf(x);
  const ty = tsOf(y);
  if (ty !== tx) return ty > tx ? y : x;
  return JSON.stringify(y) > JSON.stringify(x) ? y : x;
}

function mergeDict(a, b, track) {
  let out = a;
  for (const k of Object.keys(b)) {
    const w = newer(a[k], b[k]);
    if (w !== a[k]) {
      if (out === a) out = Object.assign(dict(), a);
      out[k] = w;
      track.changed = true;
    }
  }
  return out;
}

function mergeFolder(a, b, track) {
  if (!a) {
    track.changed = true;
    return b;
  }
  const t = { changed: false };
  const on = newer(a.on, b.on);
  const look = newer(a.look, b.look);
  const created = Math.min(a.created, b.created);
  const items = mergeDict(a.items, b.items, t);
  if (on === a.on && look === a.look && created === a.created && !t.changed) return a;
  track.changed = true;
  return { on, look, created, items };
}

/**
 * Merges `b` into `a`: every value keeps its newer version. Returns
 * { doc, changed } where `changed` says the result differs from `a`.
 * Merging is order free and repeatable: merge(a, b) and merge(b, a) hold the
 * same values, and merging the same doc twice changes nothing.
 */
export function merge(a, b) {
  const track = { changed: false };
  const doc = emptyDoc();
  doc.pool = mergeDict(a.pool, b.pool, track);
  doc.fav = mergeDict(a.fav, b.fav, track);
  doc.folders = a.folders;
  for (const id of Object.keys(b.folders)) {
    const m = mergeFolder(a.folders[id], b.folders[id], track);
    if (m !== a.folders[id]) {
      if (doc.folders === a.folders) doc.folders = Object.assign(dict(), a.folders);
      doc.folders[id] = m;
    }
  }
  doc.order = newer(a.order, b.order);
  if (doc.order !== a.order) track.changed = true;
  return { doc, changed: track.changed };
}

/** Drops deletions older than TOMBSTONE_TTL_MS so the doc does not grow forever. */
export function prune(doc, now) {
  const cut = now - TOMBSTONE_TTL_MS;
  const keep = (d) => {
    const out = dict();
    for (const [k, e] of Object.entries(d)) if (e[0] === 1 || tsOf(e) >= cut) out[k] = e;
    return out;
  };
  const folders = dict();
  for (const [id, f] of Object.entries(doc.folders)) {
    if (f.on[0] === 0 && tsOf(f.on) < cut) continue;
    folders[id] = { ...f, items: keep(f.items) };
  }
  const ids = doc.order[0].filter((id) => folders[id]);
  const order = ids.length === doc.order[0].length ? doc.order : [ids, doc.order[1]];
  return { v: doc.v, pool: keep(doc.pool), fav: keep(doc.fav), folders, order };
}

// ---------------------------------------------------------------------------
// Checking a doc from the network

function checkDict(raw, shape) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const keys = Object.keys(raw);
  if (keys.length > MAX_ENTRIES) return null;
  const out = dict();
  for (const k of keys) {
    const e = raw[k];
    if (!isValidSlug(k) || !Array.isArray(e) || !shape(e)) return null;
    out[k] = e;
  }
  return out;
}

const poolEntry = (e) => e.length === 2 && isFlag(e[0]) && isTs(e[1]);
const favEntry = (e) => e.length === 3 && isFlag(e[0]) && isTs(e[1]) && isTs(e[2]);

/**
 * Parses a doc from JSON (a client body or storage) into the exact shape
 * above, with null-prototype dicts. Anything off returns null: the server
 * refuses the request rather than storing something half valid. Folder
 * names, emoji and colors get the same cleaning as in the app.
 */
export function parseDoc(raw) {
  try {
    if (!raw || typeof raw !== "object" || raw.v !== SYNC_DOC_VERSION) return null;
    const pool = checkDict(raw.pool, poolEntry);
    const fav = checkDict(raw.fav, favEntry);
    if (!pool || !fav) return null;
    if (!raw.folders || typeof raw.folders !== "object" || Array.isArray(raw.folders)) return null;
    const ids = Object.keys(raw.folders);
    if (ids.length > MAX_ENTRIES) return null;
    const folders = dict();
    for (const id of ids) {
      const f = raw.folders[id];
      if (!FOLDER_ID_RE.test(id) || !f || typeof f !== "object") return null;
      const { on, look } = f;
      if (!Array.isArray(on) || !poolEntry(on)) return null;
      if (!Array.isArray(look) || look.length !== 4 || !isTs(look[3])) return null;
      if (!isTs(f.created)) return null;
      const items = checkDict(f.items, favEntry);
      if (!items) return null;
      folders[id] = {
        on,
        look: [
          F.cleanName(look[0], DEFAULT_FOLDER_NAME),
          F.cleanEmoji(look[1], DEFAULT_FOLDER_EMOJI),
          F.cleanColor(look[2], DEFAULT_FOLDER_COLOR),
          look[3],
        ],
        created: f.created,
        items,
      };
    }
    const order = raw.order;
    if (!Array.isArray(order) || order.length !== 2 || !Array.isArray(order[0]) || !isTs(order[1])) {
      return null;
    }
    if (order[0].length > MAX_ENTRIES || !order[0].every((id) => FOLDER_ID_RE.test(id))) return null;
    return { v: SYNC_DOC_VERSION, pool, fav, folders, order: [order[0], order[1]] };
  } catch {
    return null;
  }
}
