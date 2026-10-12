#!/usr/bin/env node
// Exercises lib/storage-migrations.mjs against a fake localStorage.
// Usage: node scripts/test-store-migration.mjs   (exit code 1 on failure)
import assert from "node:assert/strict";
import {
  BACKUP_SUFFIX,
  DATA_KEYS,
  FAVORITES_KEY,
  FOLDERS_KEY,
  LAST_RECIPE_KEY,
  MAX_FOLDERS,
  MAX_FOLDER_ITEMS,
  POOL_KEY,
  SCHEMA_KEY,
  SCHEMA_VERSION,
  UNREADABLE_SUFFIX,
  normalizeFavorites,
  normalizeFolders,
  rescueUnreadable,
  runMigrations,
} from "../lib/storage-migrations.mjs";
import * as F from "../lib/folders.mjs";

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
  assert.deepEqual(r.rewritten, [FOLDERS_KEY]); // only the new empty folders doc
  assert.equal(s.getItem(SCHEMA_KEY), String(SCHEMA_VERSION));
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
  assert.deepEqual(s.dump(), { [SCHEMA_KEY]: String(SCHEMA_VERSION) });
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
  assert.equal(r3.from, SCHEMA_VERSION);
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

// ---------------------------------------------------------------- folders

const EMPTY_DOC = JSON.stringify({ v: 1, folders: [] });
const rawFolders = (s) => JSON.parse(s.getItem(FOLDERS_KEY));

test("schema version is 3 and folders key syncs like other data keys", () => {
  assert.equal(SCHEMA_VERSION, 3);
  assert.ok(DATA_KEYS.includes(FOLDERS_KEY));
});

test("v2 -> v3: favorites/pool/last-recipe stay byte-identical, empty folders doc added", () => {
  const fav = JSON.stringify([["a", 100], ["b", 200]]);
  const pool = '["x",  "y"]'; // odd spacing: any rewrite would change the bytes
  const last = '{"slug":"a","name":"A"}';
  const s = fakeStorage({
    [SCHEMA_KEY]: "2",
    [FAVORITES_KEY]: fav,
    [POOL_KEY]: pool,
    [LAST_RECIPE_KEY]: last,
  });
  const r = runMigrations(s, NOW);
  assert.equal(r.from, 2);
  assert.equal(r.to, 3);
  assert.equal(s.getItem(FAVORITES_KEY), fav);
  assert.equal(s.getItem(POOL_KEY), pool);
  assert.equal(s.getItem(LAST_RECIPE_KEY), last);
  assert.equal(s.getItem(FOLDERS_KEY), EMPTY_DOC);
  assert.equal(s.getItem(SCHEMA_KEY), "3");
  // additive step: no v1 backups are made for a v2 install
  assert.equal(s.getItem(FAVORITES_KEY + BACKUP_SUFFIX), null);
});

test("v2 -> v3: existing valid folders doc is left untouched", () => {
  const doc = JSON.stringify({ v: 1, folders: [{ id: "f1", name: "N", items: [["a", 1]] }] });
  const s = fakeStorage({ [SCHEMA_KEY]: "2", [FOLDERS_KEY]: doc });
  runMigrations(s, NOW);
  assert.equal(s.getItem(FOLDERS_KEY), doc);
  assert.equal(s.getItem(SCHEMA_KEY), "3");
});

test("v2 -> v3: unparsable folders is kept, reported, then rescued", () => {
  const bad = '{"v":1,"folders":[{"id":';
  const s = fakeStorage({ [SCHEMA_KEY]: "2", [FOLDERS_KEY]: bad, [FAVORITES_KEY]: "[]" });
  const r = runMigrations(s, NOW);
  assert.deepEqual(r.unreadable, [FOLDERS_KEY]);
  assert.equal(s.getItem(FOLDERS_KEY), bad);
  assert.equal(rescueUnreadable(s, FOLDERS_KEY, (v) => !!normalizeFolders(v)), true);
  assert.equal(s.getItem(FOLDERS_KEY + UNREADABLE_SUFFIX), bad);
});

test("v1 install migrates all the way to 3 with backups and a folders doc", () => {
  const s = fakeStorage({ [FAVORITES_KEY]: JSON.stringify(["a", "b"]) });
  runMigrations(s, NOW);
  assert.deepEqual(favs(s), [["a", NOW - 2], ["b", NOW - 1]]);
  assert.equal(s.getItem(FAVORITES_KEY + BACKUP_SUFFIX), JSON.stringify(["a", "b"]));
  assert.equal(s.getItem(FOLDERS_KEY), EMPTY_DOC);
  assert.equal(s.getItem(SCHEMA_KEY), "3");
});

test("running migrations twice changes nothing", () => {
  const s = fakeStorage({ [SCHEMA_KEY]: "2", [FAVORITES_KEY]: '[["a",1]]' });
  runMigrations(s, NOW);
  const once = s.dump();
  const r = runMigrations(s, NOW + 5000);
  assert.equal(r.from, 3);
  assert.deepEqual(s.dump(), once);
});

test("forced re-run of 2 -> 3 never overwrites folders the user created meanwhile", () => {
  const doc = JSON.stringify({ v: 1, folders: [{ id: "f1", name: "Keep", items: [] }] });
  const s = fakeStorage({ [SCHEMA_KEY]: "2", [FOLDERS_KEY]: doc });
  runMigrations(s, NOW);
  s.setItem(SCHEMA_KEY, "2");
  runMigrations(s, NOW + 1);
  assert.equal(s.getItem(FOLDERS_KEY), doc);
});

test("schema 4 (future) is left alone, folders untouched", () => {
  const doc = JSON.stringify({ v: 2, folders: "whatever" });
  const s = fakeStorage({ [SCHEMA_KEY]: "4", [FOLDERS_KEY]: doc, [FAVORITES_KEY]: '["a"]' });
  const before = s.dump();
  runMigrations(s, NOW);
  assert.deepEqual(s.dump(), before);
});

test("fresh install writes only the schema key", () => {
  const s = fakeStorage();
  runMigrations(s, NOW);
  assert.deepEqual(s.dump(), { [SCHEMA_KEY]: "3" });
});

test("normalizeFolders: junk is dropped or repaired, never throws", () => {
  assert.equal(normalizeFolders(null), null);
  assert.equal(normalizeFolders("x"), null);
  assert.equal(normalizeFolders({ v: 2, folders: [] }), null); // newer doc
  assert.equal(normalizeFolders({ folders: "no" }), null);
  const n = normalizeFolders(
    {
      v: 1,
      folders: [
        null,
        42,
        "str",
        [],
        { name: "no id" },
        { id: "", name: "empty id" },
        { id: "a", name: "  " + "x".repeat(60) + "  ", emoji: 5, color: "red", items: "nope" },
        { id: "a", name: "duplicate id" },
        {
          id: "b",
          name: " Dinner ",
          emoji: "\u{1F35D}",
          color: "#aabbcc",
          createdAt: 5,
          updatedAt: "bad",
          items: [["s1", 10], ["s1", 20], "s2", { slug: "s3", addedAt: 3 }, [7, 1], null, ["", 1]],
        },
      ],
    },
    NOW,
  );
  assert.equal(n.changed, true);
  assert.equal(n.folders.length, 2);
  const [a, b] = n.folders;
  assert.equal(a.id, "a");
  assert.equal(a.name, "x".repeat(40));
  assert.equal(a.emoji, "\u{1F4C1}");
  assert.equal(a.color, "#d4451f");
  assert.deepEqual(a.items, []);
  assert.equal(a.createdAt, NOW);
  assert.equal(b.name, "Dinner");
  assert.equal(b.updatedAt, 5);
  assert.deepEqual(b.items, [["s1", 10], ["s2", NOW], ["s3", 3]]);
});

test("normalizeFolders: caps 50 folders and 2000 items per folder", () => {
  const folders = Array.from({ length: 70 }, (_, i) => ({
    id: "f" + i,
    items: Array.from({ length: 2100 }, (_, j) => ["s" + j, 5000 - j]),
  }));
  const n = normalizeFolders({ v: 1, folders }, NOW);
  assert.equal(n.folders.length, MAX_FOLDERS);
  assert.equal(n.folders[0].items.length, MAX_FOLDER_ITEMS);
  assert.equal(n.folders[0].items[0][0], "s0"); // newest kept, oldest dropped
  assert.equal(n.changed, true);
});

test("normalizeFolders: a clean doc round-trips unchanged", () => {
  const doc = {
    v: 1,
    folders: [
      { id: "a", name: "A", emoji: "\u{1F35D}", color: "#d4451f", createdAt: 1, updatedAt: 2, items: [["x", 9], ["y", 3]] },
    ],
  };
  const n = normalizeFolders(doc, NOW);
  assert.equal(n.changed, false);
  assert.deepEqual({ v: 1, folders: n.folders }, doc);
});

test("palette and emoji lists", () => {
  assert.equal(F.FOLDER_COLORS.length, 8);
  assert.ok(F.FOLDER_COLORS.every((c) => /^#[0-9a-f]{6}$/i.test(c)));
  assert.equal(new Set(F.FOLDER_COLORS).size, 8);
  assert.equal(F.FOLDER_EMOJIS.length, 24);
});

test("folder ops: create prepends, defaults, trims", () => {
  let r = F.createFolder([], {}, 100, "a");
  assert.equal(r.id, "a");
  assert.deepEqual(r.folders[0], {
    id: "a", name: "New folder", emoji: "\u{1F4C1}", color: F.FOLDER_COLORS[0],
    createdAt: 100, updatedAt: 100, items: [],
  });
  r = F.createFolder(r.folders, { name: "  Soup  ", emoji: "\u{1F372}", color: "#3f8f6b" }, 200, "b");
  assert.deepEqual(r.folders.map((f) => f.id), ["b", "a"]);
  assert.equal(r.folders[0].name, "Soup");
  const auto = F.createFolder(r.folders, {}, 300);
  assert.ok(auto.id && auto.id !== "a" && auto.id !== "b");
  // cap
  let many = [];
  for (let i = 0; i < MAX_FOLDERS; i++) many = F.createFolder(many, {}, i, "f" + i).folders;
  const capped = F.createFolder(many, {}, 1);
  assert.equal(capped.id, null);
  assert.equal(capped.folders, many);
});

test("folder ops: update patches, ignores bad values, keeps reference when unchanged", () => {
  const { folders } = F.createFolder([], { name: "A" }, 100, "a");
  const u = F.updateFolder(folders, "a", { name: " B ", color: "#e08a2c" }, 200);
  assert.equal(u[0].name, "B");
  assert.equal(u[0].color, "#e08a2c");
  assert.equal(u[0].updatedAt, 200);
  assert.equal(F.updateFolder(u, "a", { name: "B" }, 300), u);
  assert.equal(F.updateFolder(u, "a", { name: "   ", color: "nope" }, 300), u);
  assert.equal(F.updateFolder(u, "zzz", { name: "X" }, 300), u);
});

test("folder ops: delete keeps favorites, move reorders and clamps", () => {
  let folders = [];
  for (const id of ["a", "b", "c"]) folders = F.createFolder(folders, {}, 1, id).folders; // c b a
  assert.deepEqual(folders.map((f) => f.id), ["c", "b", "a"]);
  assert.deepEqual(F.moveFolder(folders, "a", 0).map((f) => f.id), ["a", "c", "b"]);
  assert.deepEqual(F.moveFolder(folders, "c", 99).map((f) => f.id), ["b", "a", "c"]);
  assert.deepEqual(F.moveFolder(folders, "b", -5).map((f) => f.id), ["b", "c", "a"]);
  assert.equal(F.moveFolder(folders, "b", 1), folders);
  assert.equal(F.moveFolder(folders, "nope", 0), folders);
  const favorites = new Map([["x", 1]]);
  const st = F.setRecipeInFolder({ favorites, folders }, "x", "a", true, 10);
  const del = F.deleteFolder(st.folders, "a");
  assert.deepEqual(del.map((f) => f.id), ["c", "b"]);
  assert.equal(st.favorites.get("x"), 1);
  assert.equal(F.deleteFolder(del, "a"), del);
});

test("setRecipeInFolder: adds newest first, auto-favorites, removes from one folder only", () => {
  let folders = F.createFolder([], {}, 1, "a").folders;
  folders = F.createFolder(folders, {}, 1, "b").folders;
  let st = { favorites: new Map([["old", 5]]), folders };
  st = F.setRecipeInFolder(st, "new", "a", true, 100);
  assert.equal(st.favorites.get("new"), 100); // auto-favorited
  st = F.setRecipeInFolder(st, "old", "a", true, 200);
  assert.deepEqual(st.folders.find((f) => f.id === "a").items.map((i) => i.slug), ["old", "new"]);
  assert.equal(st.favorites.get("old"), 5); // existing favorite time kept
  st = F.setRecipeInFolder(st, "old", "b", true, 300);
  assert.deepEqual(F.foldersForRecipe(st.folders, "old").sort(), ["a", "b"]);
  const same = F.setRecipeInFolder(st, "old", "b", true, 400);
  assert.equal(same, st); // already in folder: no-op
  st = F.setRecipeInFolder(st, "old", "a", false, 500);
  assert.deepEqual(F.foldersForRecipe(st.folders, "old"), ["b"]);
  assert.ok(st.favorites.has("old")); // removal never un-favorites
  assert.equal(F.setRecipeInFolder(st, "zzz", "nope", true, 1), st); // unknown folder: nothing favorited
  assert.equal(st.favorites.has("zzz"), false);
});

test("setRecipeInFolder: a full folder refuses new items (state unchanged)", () => {
  const base = F.createFolder([], {}, 1, "a").folders;
  const items = Array.from({ length: MAX_FOLDER_ITEMS }, (_, i) => ({ slug: `s${i}`, addedAt: i }));
  const folders = [{ ...base[0], items }];
  const favorites = new Map(items.map((i) => [i.slug, i.addedAt]));
  const st = { favorites, folders };
  assert.equal(F.setRecipeInFolder(st, "extra", "a", true, 99), st);
  assert.equal(F.setRecipeInFolder(st, "s1", "a", true, 99), st); // already in: no-op
  assert.equal(st.favorites.has("extra"), false);
});

test("suggestFolderLook skips emojis and colors already used", () => {
  assert.deepEqual(F.suggestFolderLook([]), { emoji: F.FOLDER_EMOJIS[0], color: F.FOLDER_COLORS[0] });
  let folders = [];
  for (let i = 0; i < 6; i++) {
    const look = F.suggestFolderLook(folders);
    assert.ok(!folders.some((f) => f.emoji === look.emoji || f.color === look.color));
    folders = F.createFolder(folders, look, 1, `f${i}`).folders;
  }
  // custom first folder using the 3rd color: the next one avoids it
  const used = [{ emoji: F.FOLDER_EMOJIS[0], color: F.FOLDER_COLORS[2].toUpperCase() }];
  assert.notEqual(F.suggestFolderLook(used).color.toLowerCase(), F.FOLDER_COLORS[2]);
  assert.notEqual(F.suggestFolderLook(used).emoji, F.FOLDER_EMOJIS[0]);
  // everything used: still returns valid values
  const all = F.FOLDER_COLORS.map((c, i) => ({ emoji: F.FOLDER_EMOJIS[i], color: c }));
  const full = F.FOLDER_EMOJIS.map((e, i) => ({ emoji: e, color: F.FOLDER_COLORS[i % F.FOLDER_COLORS.length] }));
  assert.ok(F.FOLDER_COLORS.includes(F.suggestFolderLook(full).color));
  assert.ok(F.FOLDER_EMOJIS.includes(F.suggestFolderLook(all).emoji));
});

test("unfavorite removes from all folders; restore puts back at the right position", () => {
  let folders = F.createFolder([], {}, 1, "a").folders;
  folders = F.createFolder(folders, {}, 1, "b").folders;
  let st = { favorites: new Map(), folders };
  st = F.setRecipeInFolder(st, "r1", "a", true, 100);
  st = F.setRecipeInFolder(st, "r2", "a", true, 200);
  st = F.setRecipeInFolder(st, "r3", "a", true, 300);
  st = F.setRecipeInFolder(st, "r2", "b", true, 400);
  const items = (state, id) => state.folders.find((f) => f.id === id).items.map((i) => i.slug);
  assert.deepEqual(items(st, "a"), ["r3", "r2", "r1"]);

  const un = F.unfavorite(st, "r2", 1000);
  assert.deepEqual(un.snapshot, { slug: "r2", addedAt: 200, folderItems: [["b", 400], ["a", 200]] });
  assert.equal(un.favorites.has("r2"), false);
  assert.deepEqual(items(un, "a"), ["r3", "r1"]);
  assert.deepEqual(items(un, "b"), []);
  assert.ok(un.favorites.has("r1") && un.favorites.has("r3"));
  assert.equal(st.favorites.has("r2"), true); // input not mutated

  const back = F.restoreFavorite(un, un.snapshot, 2000);
  assert.equal(back.favorites.get("r2"), 200);
  assert.deepEqual([...back.favorites.keys()], ["r1", "r2", "r3"]); // original order
  assert.deepEqual(items(back, "a"), ["r3", "r2", "r1"]);
  assert.deepEqual(items(back, "b"), ["r2"]);
  assert.deepEqual(F.restoreFavorite(back, un.snapshot, 3000), back); // idempotent

  // folder deleted meanwhile: favorite is still restored, others skipped
  const gone = { ...un, folders: F.deleteFolder(un.folders, "b") };
  const part = F.restoreFavorite(gone, un.snapshot, 2000);
  assert.equal(part.favorites.get("r2"), 200);
  assert.deepEqual(items(part, "a"), ["r3", "r2", "r1"]);
  assert.equal(part.folders.find((f) => f.id === "b"), undefined);

  // never-favorited slug: no snapshot, state untouched
  const nope = F.unfavorite(st, "ghost");
  assert.equal(nope.snapshot, null);
  assert.equal(nope.favorites, st.favorites);
  assert.equal(F.restoreFavorite(st, null), st);
});

test("doc round trip: runtime <-> stored shape", () => {
  let folders = F.createFolder([], { name: "A" }, 1, "a").folders;
  const st = F.setRecipeInFolder({ favorites: new Map(), folders }, "x", "a", true, 9);
  const doc = F.foldersToDoc(st.folders);
  assert.deepEqual(doc.folders[0].items, [["x", 9]]);
  const n = normalizeFolders(JSON.parse(JSON.stringify(doc)), NOW);
  assert.equal(n.changed, false);
  assert.deepEqual(F.foldersFromDoc(n.folders), st.folders);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
