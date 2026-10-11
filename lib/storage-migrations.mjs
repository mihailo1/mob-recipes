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
 */

export const SCHEMA_KEY = "mob-recipes:schema";
export const SCHEMA_VERSION = 2;
export const POOL_KEY = "mob-recipes:pool";
export const FAVORITES_KEY = "mob-recipes:favorites";
export const LAST_RECIPE_KEY = "mob-recipes:last-recipe";
export const DATA_KEYS = [POOL_KEY, FAVORITES_KEY, LAST_RECIPE_KEY];
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

const STEPS = [[2, migrateTo2]];

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
