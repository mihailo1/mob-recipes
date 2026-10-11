/*
 * localStorage schema migrations. Pure functions, no React, no window, so
 * scripts/test-store-migration.mjs can run them in plain Node with a fake
 * storage object ({ getItem, setItem, removeItem }).
 *
 * Rules (user data must survive every app update):
 * - Never delete or overwrite data we cannot parse. Leave it in place.
 * - Before the first migration, copy every raw value to `<key>:backup-v1`
 *   (only if that backup does not exist yet, so it is never overwritten).
 * - Idempotent: running twice changes nothing the second time.
 * - A schema number from the future (user went back to an older build) is
 *   left alone.
 *
 * History:
 *   1 (implicit, no schema key): old app. favorites = ["slug", ...]
 *   2: favorites = [["slug", addedAt], ...], pool = ["slug", ...] (deduped)
 *   3: adds folders = { v: 1, folders: [...] } (purely additive, see
 *      normalizeFolders). favorites and pool are never touched by this step.
 */

export const SCHEMA_KEY = "mob-recipes:schema";
export const SCHEMA_VERSION = 3;
export const POOL_KEY = "mob-recipes:pool";
export const FAVORITES_KEY = "mob-recipes:favorites";
export const LAST_RECIPE_KEY = "mob-recipes:last-recipe";
export const FOLDERS_KEY = "mob-recipes:folders";
export const FOLDERS_DOC_VERSION = 1;
export const MAX_FOLDERS = 50;
export const MAX_FOLDER_ITEMS = 2000;
export const MAX_FOLDER_NAME = 40;
export const DEFAULT_FOLDER_NAME = "New folder";
export const DEFAULT_FOLDER_EMOJI = "\u{1F4C1}";
export const DEFAULT_FOLDER_COLOR = "#d4451f";
export const DATA_KEYS = [POOL_KEY, FAVORITES_KEY, LAST_RECIPE_KEY, FOLDERS_KEY];
export const BACKUP_SUFFIX = ":backup-v1";

/** JSON.parse that reports failure instead of throwing. */
export function safeParse(raw) {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false, value: null };
  }
}

/*
 * Normalizes any known favorites shape to [[slug, addedAt], ...].
 * Accepts: plain slug strings (legacy), [slug, ts] pairs, { slug, addedAt }
 * objects, or a mix. Legacy entries get synthetic, strictly increasing
 * timestamps ending just before `now`, so their order survives sorting by
 * addedAt. Duplicates keep the first occurrence. Unknown entries are skipped.
 * Returns null when the value is not an array at all (unknown shape: the
 * caller must leave the stored value untouched).
 */
export function normalizeFavorites(value, now = Date.now()) {
  if (!Array.isArray(value)) return null;
  const out = new Map();
  let changed = false;
  value.forEach((entry, i) => {
    let slug = null;
    let ts = null;
    if (typeof entry === "string") {
      slug = entry;
      ts = now - (value.length - i);
      changed = true;
    } else if (Array.isArray(entry) && typeof entry[0] === "string") {
      slug = entry[0];
      ts = Number.isFinite(entry[1]) ? entry[1] : now - (value.length - i);
      if (!Number.isFinite(entry[1]) || entry.length !== 2) changed = true;
    } else if (entry && typeof entry === "object" && typeof entry.slug === "string") {
      slug = entry.slug;
      ts = Number.isFinite(entry.addedAt) ? entry.addedAt : now - (value.length - i);
      changed = true;
    } else {
      changed = true; // dropped junk entry (raw copy stays in the backup)
      return;
    }
    if (!slug) {
      changed = true;
      return;
    }
    if (out.has(slug)) {
      changed = true;
      return;
    }
    out.set(slug, ts);
  });
  return { entries: [...out], changed };
}

/** Pool: array of unique slug strings. null for an unknown shape. */
export function normalizePool(value) {
  if (!Array.isArray(value)) return null;
  const set = new Set(value.filter((s) => typeof s === "string" && s));
  const entries = [...set];
  return { entries, changed: entries.length !== value.length };
}

const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

/*
 * Folders doc: { v: 1, folders: [{ id, name, emoji, color, createdAt,
 * updatedAt, items: [[slug, addedAt], ...] }] }. Array order = display order,
 * items newest first. Accepts the doc or a bare folders array. Tolerates junk:
 * drops invalid folders (no id, duplicate id) and invalid or duplicate items,
 * repairs bad name/emoji/color/timestamps with defaults, trims names to 40
 * chars, caps at 50 folders and 2000 items per folder. Never throws.
 * Returns null when the value is not a known folders shape (including a doc
 * from a newer version): the caller must leave the stored value untouched.
 * Otherwise { folders, changed } where `changed` means the normalized doc
 * differs from the input (the caller should keep a raw copy before saving).
 */
export function normalizeFolders(value, now = Date.now()) {
  try {
    let list;
    let wrapped = false;
    if (Array.isArray(value)) {
      list = value;
    } else if (
      value &&
      typeof value === "object" &&
      Array.isArray(value.folders) &&
      (value.v === undefined || value.v === FOLDERS_DOC_VERSION)
    ) {
      list = value.folders;
      wrapped = value.v === FOLDERS_DOC_VERSION;
    } else {
      return null;
    }
    const ids = new Set();
    const folders = [];
    for (const f of list) {
      if (folders.length >= MAX_FOLDERS) break;
      if (!f || typeof f !== "object" || Array.isArray(f)) continue;
      if (typeof f.id !== "string" || !f.id || ids.has(f.id)) continue;
      ids.add(f.id);
      const name =
        typeof f.name === "string" ? f.name.trim().slice(0, MAX_FOLDER_NAME).trim() : "";
      const emoji =
        typeof f.emoji === "string" && f.emoji && f.emoji.length <= 16
          ? f.emoji
          : DEFAULT_FOLDER_EMOJI;
      const color =
        typeof f.color === "string" && COLOR_RE.test(f.color) ? f.color : DEFAULT_FOLDER_COLOR;
      const createdAt = Number.isFinite(f.createdAt) ? f.createdAt : now;
      const updatedAt = Number.isFinite(f.updatedAt) ? f.updatedAt : createdAt;
      const seen = new Set();
      const items = [];
      if (Array.isArray(f.items)) {
        for (const it of f.items) {
          if (items.length >= MAX_FOLDER_ITEMS) break;
          let slug = null;
          let ts = null;
          if (Array.isArray(it)) {
            slug = it[0];
            ts = it[1];
          } else if (it && typeof it === "object") {
            slug = it.slug;
            ts = it.addedAt;
          } else if (typeof it === "string") {
            slug = it;
          }
          if (typeof slug !== "string" || !slug || seen.has(slug)) continue;
          seen.add(slug);
          items.push([slug, Number.isFinite(ts) ? ts : now]);
        }
      }
      folders.push({
        id: f.id,
        name: name || DEFAULT_FOLDER_NAME,
        emoji,
        color,
        createdAt,
        updatedAt,
        items,
      });
    }
    const doc = { v: FOLDERS_DOC_VERSION, folders };
    const changed = !wrapped || JSON.stringify(doc) !== JSON.stringify(value);
    return { folders, changed };
  } catch {
    return null;
  }
}

function hasAnyData(storage) {
  return DATA_KEYS.some((k) => storage.getItem(k) !== null);
}

function readSchema(storage) {
  const raw = storage.getItem(SCHEMA_KEY);
  if (raw === null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

/** Copies each existing raw data value to `<key>:backup-v1` once. */
export function backupV1(storage) {
  for (const key of DATA_KEYS) {
    const raw = storage.getItem(key);
    if (raw === null) continue;
    if (storage.getItem(key + BACKUP_SUFFIX) !== null) continue;
    storage.setItem(key + BACKUP_SUFFIX, raw);
  }
}

/* v1 -> v2. Rewrites a key only when its JSON parses to a known shape. */
function migrateTo2(storage, now, report) {
  const fav = safeParse(storage.getItem(FAVORITES_KEY));
  if (!fav.ok) report.unreadable.push(FAVORITES_KEY);
  else if (fav.value !== null) {
    const norm = normalizeFavorites(fav.value, now);
    if (!norm) report.unreadable.push(FAVORITES_KEY);
    else if (norm.changed) {
      storage.setItem(FAVORITES_KEY, JSON.stringify(norm.entries));
      report.rewritten.push(FAVORITES_KEY);
    }
  }

  const pool = safeParse(storage.getItem(POOL_KEY));
  if (!pool.ok) report.unreadable.push(POOL_KEY);
  else if (pool.value !== null) {
    const norm = normalizePool(pool.value);
    if (!norm) report.unreadable.push(POOL_KEY);
    else if (norm.changed) {
      storage.setItem(POOL_KEY, JSON.stringify(norm.entries));
      report.rewritten.push(POOL_KEY);
    }
  }
}

/*
 * v2 -> v3: purely additive. Creates an empty folders doc when the key is
 * missing. An existing value (readable or not) is never rewritten here, and
 * favorites / pool are not read or written at all.
 */
function migrateTo3(storage, now, report) {
  const raw = storage.getItem(FOLDERS_KEY);
  if (raw === null) {
    storage.setItem(
      FOLDERS_KEY,
      JSON.stringify({ v: FOLDERS_DOC_VERSION, folders: [] }),
    );
    report.rewritten.push(FOLDERS_KEY);
    return;
  }
  if (!safeParse(raw).ok) report.unreadable.push(FOLDERS_KEY);
}

const STEPS = [
  [2, migrateTo2],
  [3, migrateTo3],
];

/*
 * Brings storage up to SCHEMA_VERSION. Returns a small report:
 * { from, to, fresh, rewritten: [keys], unreadable: [keys], error? }.
 * Any storage exception stops the run without bumping the schema, so it is
 * retried on the next load.
 */
export function runMigrations(storage, now = Date.now()) {
  const report = { from: null, to: null, fresh: false, rewritten: [], unreadable: [] };
  try {
    const current = readSchema(storage);
    report.from = current;
    if (current !== null && current >= SCHEMA_VERSION) {
      report.to = current;
      return report;
    }
    if (current === null && !hasAnyData(storage)) {
      storage.setItem(SCHEMA_KEY, String(SCHEMA_VERSION));
      report.fresh = true;
      report.to = SCHEMA_VERSION;
      return report;
    }
    const from = current ?? 1;
    if (from < 2) backupV1(storage);
    for (const [target, step] of STEPS) {
      if (target <= from) continue;
      step(storage, now, report);
      storage.setItem(SCHEMA_KEY, String(target));
      report.to = target;
    }
  } catch (err) {
    report.error = String(err && err.message ? err.message : err);
  }
  return report;
}

export const UNREADABLE_SUFFIX = ":unreadable";

/*
 * Called by the store when a key does not parse (or has an unknown shape). Keeps the raw text under
 * `<key>:unreadable` before the app can overwrite the key on the next save.
 * Never overwrites an existing rescue copy.
 */
export function rescueUnreadable(storage, key, isValid = () => true) {
  try {
    const raw = storage.getItem(key);
    if (raw === null || storage.getItem(key + UNREADABLE_SUFFIX) !== null) return false;
    const parsed = safeParse(raw);
    if (parsed.ok && (parsed.value === null || isValid(parsed.value))) return false;
    storage.setItem(key + UNREADABLE_SUFFIX, raw);
    return true;
  } catch {
    return false;
  }
}
