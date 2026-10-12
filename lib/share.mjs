// Shared folder links: what goes into a link, how it is checked on the
// server and how it is added to the receiver's Saved. Pure functions, no I/O,
// shared by the API route, the client and scripts/test-share.mjs.
//
// A link is a copy, not a live folder: the receiver gets their own folders
// and later changes on either side stay on that side.
//
// Doc shape: { v: 1, kind, folders: [{ name, emoji, color, items: [slug] }], loose: [slug] }
//   kind "folder": exactly one folder, no loose recipes
//   kind "all":    every folder plus saved recipes that are in no folder
// Items are newest first.

import { isValidSlug } from "./nearby.mjs";
import * as F from "./folders.mjs";
import {
  DEFAULT_FOLDER_COLOR,
  DEFAULT_FOLDER_EMOJI,
  DEFAULT_FOLDER_NAME,
  MAX_FOLDERS,
  MAX_FOLDER_ITEMS,
} from "./storage-migrations.mjs";

export const SHARE_DOC_VERSION = 1;
export const MAX_SHARE_BYTES = 300 * 1024;
export const MAX_SHARE_RECIPES = 5000;
export const SHARE_TTL_S = 365 * 24 * 60 * 60;
const ID_LEN = 10;
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const ID_RE = new RegExp(`^[A-Za-z0-9]{${ID_LEN}}$`);

export function isValidShareId(s) {
  return typeof s === "string" && ID_RE.test(s);
}

export function newShareId() {
  const bytes = new Uint8Array(ID_LEN);
  globalThis.crypto.getRandomValues(bytes);
  // 256 % 57 bias is irrelevant for a 10 char random id.
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("");
}

/** The share id inside a pasted link (".../s/<id>") or a bare id, else null. */
export function extractShareId(text) {
  if (typeof text !== "string") return null;
  const m = /\/s\/([A-Za-z0-9]{10})(?![A-Za-z0-9])/.exec(text);
  if (m) return m[1];
  const t = text.trim();
  return isValidShareId(t) ? t : null;
}

function cleanSlugs(list, seen, budget) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const s of list) {
    if (out.length >= MAX_FOLDER_ITEMS || budget.left <= 0) break;
    if (!isValidSlug(s) || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    budget.left -= 1;
  }
  return out;
}

/**
 * Checks and cleans a doc sent by a client. Returns { ok, doc }. Bad slugs
 * and duplicates are dropped; a doc with no recipes at all is refused.
 */
export function validateShare(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false };
  const kind = body.kind;
  if (kind !== "folder" && kind !== "all") return { ok: false };
  if (!Array.isArray(body.folders) || body.folders.length > MAX_FOLDERS) return { ok: false };
  if (kind === "folder" && body.folders.length !== 1) return { ok: false };
  const budget = { left: MAX_SHARE_RECIPES };
  let total = 0;
  const folders = [];
  for (const f of body.folders) {
    if (!f || typeof f !== "object") return { ok: false };
    const items = cleanSlugs(f.items, new Set(), budget);
    total += items.length;
    folders.push({
      name: F.cleanName(f.name, DEFAULT_FOLDER_NAME),
      emoji: F.cleanEmoji(f.emoji, DEFAULT_FOLDER_EMOJI),
      color: F.cleanColor(f.color, DEFAULT_FOLDER_COLOR),
      items,
    });
  }
  const loose = kind === "all" ? cleanSlugs(body.loose, new Set(), budget) : [];
  total += loose.length;
  if (!total) return { ok: false };
  return { ok: true, doc: { v: SHARE_DOC_VERSION, kind, folders, loose } };
}

/** Every distinct recipe in a doc, folders first. */
export function shareSlugs(doc) {
  const seen = new Set();
  for (const f of doc.folders) for (const s of f.items) seen.add(s);
  for (const s of doc.loose) seen.add(s);
  return [...seen];
}

/**
 * The doc to send for one folder (folderId) or for everything (null).
 * Only saved recipes count, like everywhere in the folder UI; `isKnown`
 * filters out recipes the index no longer has.
 */
export function buildShare({ favorites, folders }, folderId, isKnown = () => true) {
  const live = (f) =>
    f.items.map((i) => i.slug).filter((s) => favorites.has(s) && isKnown(s));
  const look = (f) => ({ name: f.name, emoji: f.emoji, color: f.color, items: live(f) });
  if (folderId) {
    const f = folders.find((x) => x.id === folderId);
    return f ? { v: SHARE_DOC_VERSION, kind: "folder", folders: [look(f)], loose: [] } : null;
  }
  const filed = new Set();
  for (const f of folders) for (const i of f.items) filed.add(i.slug);
  const loose = [...favorites]
    .filter(([s]) => !filed.has(s) && isKnown(s))
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);
  return { v: SHARE_DOC_VERSION, kind: "all", folders: folders.map(look), loose };
}

const nameKey = (s) => String(s).trim().toLowerCase();

/**
 * Adds a shared doc to { favorites, folders }. A folder with the same name
 * (any case) gets the missing recipes, so opening a link twice adds nothing
 * new; otherwise a new folder is created. Every recipe ends up saved. When
 * the 50 folder cap (or a folder's item cap) is hit the recipes are still
 * saved, just not filed.
 *
 * Returns { favorites, folders, folderIds, newRecipes } where folderIds are
 * the receiving folders in doc order (null where the cap was hit).
 */
export function importShare(state, doc, now = Date.now()) {
  let next = { favorites: state.favorites, folders: state.folders };
  const before = new Set(state.favorites.keys());
  const folderIds = new Array(doc.folders.length).fill(null);
  // createFolder prepends, so go backwards to keep the doc's folder order.
  for (let fi = doc.folders.length - 1; fi >= 0; fi--) {
    const f = doc.folders[fi];
    let id = next.folders.find((x) => nameKey(x.name) === nameKey(f.name))?.id || null;
    if (!id && next.folders.length < MAX_FOLDERS) {
      const made = F.createFolder(next.folders, f, now);
      id = made.id;
      next = { ...next, folders: made.folders };
    }
    folderIds[fi] = id;
    // Oldest first with rising times, so the newest ends up on top.
    for (let i = f.items.length - 1; i >= 0; i--) {
      const t = now - i;
      // A full folder refuses the add; the recipe is still saved.
      if (id) next = F.setRecipeInFolder(next, f.items[i], id, true, t);
      next = F.favorite(next, f.items[i], t);
    }
  }
  for (let i = doc.loose.length - 1; i >= 0; i--) {
    next = F.favorite(next, doc.loose[i], now - i);
  }
  let newRecipes = 0;
  for (const s of next.favorites.keys()) if (!before.has(s)) newRecipes += 1;
  return { favorites: next.favorites, folders: next.folders, folderIds, newRecipes };
}
