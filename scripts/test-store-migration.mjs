#!/usr/bin/env node
// Exercises lib/storage-migrations.mjs against a fake localStorage.
// Usage: node scripts/test-store-migration.mjs   (exit code 1 on failure)
import assert from "node:assert/strict";
import {
  BACKUP_SUFFIX,
  FAVORITES_KEY,
  LAST_RECIPE_KEY,
  POOL_KEY,
  SCHEMA_KEY,
  SCHEMA_VERSION,
  UNREADABLE_SUFFIX,
  normalizeFavorites,
  rescueUnreadable,
  runMigrations,
} from "../lib/storage-migrations.mjs";

function fakeStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

const NOW = 1_760_000_000_000;
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok   ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}\n${err.stack}`);
    process.exitCode = 1;
  }
}
const favs = (s) => JSON.parse(s.getItem(FAVORITES_KEY));

test("old app: plain slug array becomes ordered pairs, backup kept", () => {
  const raw = JSON.stringify(["a", "b", "c"]);
  const s = fakeStorage({
    [FAVORITES_KEY]: raw,
    [POOL_KEY]: JSON.stringify(["x", "y"]),
    [LAST_RECIPE_KEY]: JSON.stringify({ slug: "a", name: "A" }),
  });
  const r = runMigrations(s, NOW);
  assert.equal(r.from, null);
  assert.equal(r.to, SCHEMA_VERSION);
  assert.deepEqual(favs(s), [["a", NOW - 3], ["b", NOW - 2], ["c", NOW - 1]]);
  assert.equal(s.getItem(FAVORITES_KEY + BACKUP_SUFFIX), raw);
  assert.equal(s.getItem(POOL_KEY + BACKUP_SUFFIX), JSON.stringify(["x", "y"]));
  assert.ok(s.getItem(LAST_RECIPE_KEY + BACKUP_SUFFIX));
  assert.deepEqual(JSON.parse(s.getItem(POOL_KEY)), ["x", "y"]);
  assert.equal(s.getItem(SCHEMA_KEY), String(SCHEMA_VERSION));
});

test("already migrated pairs (no schema key yet) are left as is", () => {
  const raw = JSON.stringify([["a", 100], ["b", 200]]);
  const s = fakeStorage({ [FAVORITES_KEY]: raw });
  const r = runMigrations(s, NOW);
  assert.equal(s.getItem(FAVORITES_KEY), raw);
  assert.deepEqual(r.rewritten, []);
  assert.equal(s.getItem(SCHEMA_KEY), "2");
});

test("mixed legacy + pairs + duplicates + junk", () => {
  const s = fakeStorage({
    [FAVORITES_KEY]: JSON.stringify(["a", ["b", 5], "a", 42, null, { slug: "c", addedAt: 7 }]),
  });
  runMigrations(s, NOW);
  assert.deepEqual(favs(s), [["a", NOW - 6], ["b", 5], ["c", 7]]);
});

test("empty storage (fresh install): only the schema key is written", () => {
  const s = fakeStorage();
  const r = runMigrations(s, NOW);
  assert.equal(r.fresh, true);
  assert.deepEqual(s.dump(), { [SCHEMA_KEY]: "2" });
});

test("empty array favorites stay empty", () => {
  const s = fakeStorage({ [FAVORITES_KEY]: "[]" });
  runMigrations(s, NOW);
  assert.equal(s.getItem(FAVORITES_KEY), "[]");
});

test("corrupted JSON is never wiped; backup + rescue copy kept", () => {
  const bad = '["a","b"';
  const s = fakeStorage({ [FAVORITES_KEY]: bad, [POOL_KEY]: '["p"]' });
  const r = runMigrations(s, NOW);
  assert.deepEqual(r.unreadable, [FAVORITES_KEY]);
  assert.equal(s.getItem(FAVORITES_KEY), bad);
  assert.equal(s.getItem(FAVORITES_KEY + BACKUP_SUFFIX), bad);
  assert.equal(rescueUnreadable(s, FAVORITES_KEY, Array.isArray), true);
  assert.equal(s.getItem(FAVORITES_KEY + UNREADABLE_SUFFIX), bad);
  // Second rescue never overwrites the first copy.
  s.setItem(FAVORITES_KEY, "{also bad");
  assert.equal(rescueUnreadable(s, FAVORITES_KEY, Array.isArray), false);
  assert.equal(s.getItem(FAVORITES_KEY + UNREADABLE_SUFFIX), bad);
  assert.deepEqual(JSON.parse(s.getItem(POOL_KEY)), ["p"]);
});

test("unknown shape (object) is left untouched", () => {
  const raw = JSON.stringify({ a: 1 });
  const s = fakeStorage({ [FAVORITES_KEY]: raw });
  const r = runMigrations(s, NOW);
  assert.equal(s.getItem(FAVORITES_KEY), raw);
  assert.deepEqual(r.unreadable, [FAVORITES_KEY]);
});

test("idempotent: second run is a no-op, backup not overwritten", () => {
  const s = fakeStorage({ [FAVORITES_KEY]: JSON.stringify(["a"]) });
  runMigrations(s, NOW);
  const after1 = s.dump();
  s.setItem(SCHEMA_KEY, "1"); // even a forced re-run must not change data
  runMigrations(s, NOW + 1000);
  const after2 = s.dump();
  assert.equal(after2[FAVORITES_KEY], after1[FAVORITES_KEY]);
  assert.equal(after2[FAVORITES_KEY + BACKUP_SUFFIX], after1[FAVORITES_KEY + BACKUP_SUFFIX]);
  const r3 = runMigrations(s, NOW + 2000);
  assert.equal(r3.from, 2);
  assert.deepEqual(s.dump(), after2);
});

test("schema from the future is left alone", () => {
  const s = fakeStorage({ [SCHEMA_KEY]: "9", [FAVORITES_KEY]: JSON.stringify(["a"]) });
  runMigrations(s, NOW);
  assert.equal(s.getItem(FAVORITES_KEY), JSON.stringify(["a"]));
  assert.equal(s.getItem(SCHEMA_KEY), "9");
});

test("pool duplicates and non-strings are dropped", () => {
  const s = fakeStorage({ [POOL_KEY]: JSON.stringify(["x", "x", 3, "y"]) });
  runMigrations(s, NOW);
  assert.deepEqual(JSON.parse(s.getItem(POOL_KEY)), ["x", "y"]);
  assert.equal(s.getItem(POOL_KEY + BACKUP_SUFFIX), JSON.stringify(["x", "x", 3, "y"]));
});

test("storage that throws (quota/private mode) does not bump schema", () => {
  const s = fakeStorage({ [FAVORITES_KEY]: JSON.stringify(["a"]) });
  s.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  const r = runMigrations(s, NOW);
  assert.ok(r.error);
  assert.equal(s.getItem(SCHEMA_KEY), null);
  assert.equal(s.getItem(FAVORITES_KEY), JSON.stringify(["a"]));
});

test("normalizeFavorites returns null for non-arrays", () => {
  assert.equal(normalizeFavorites(null), null);
  assert.equal(normalizeFavorites("a"), null);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
