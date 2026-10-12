#!/usr/bin/env node
// Exercises lib/share.mjs (shared folder links). No I/O.
// Usage: node scripts/test-share.mjs   (exit code 1 on failure)
import assert from "node:assert/strict";
import {
  buildShare,
  extractShareId,
  importShare,
  isValidShareId,
  newShareId,
  shareSlugs,
  validateShare,
} from "../lib/share.mjs";
import * as F from "../lib/folders.mjs";

// ids and pasted links
for (let i = 0; i < 50; i++) assert.ok(isValidShareId(newShareId()));
assert.equal(extractShareId("https://mob-recipes.vercel.app/s/AbCdEf2345"), "AbCdEf2345");
assert.equal(extractShareId("Look at this! https://x.app/s/AbCdEf2345?x=1 nice"), "AbCdEf2345");
assert.equal(extractShareId("  AbCdEf2345 "), "AbCdEf2345");
assert.equal(extractShareId("https://x.app/s/AbCdEf23456"), null);
assert.equal(extractShareId("hello"), null);
assert.equal(extractShareId(null), null);

// A kitchen to share from.
let st = { favorites: new Map(), folders: [] };
const mk = (name) => {
  const r = F.createFolder(st.folders, { name, emoji: "\u{1F35D}", color: "#3f8f6b" }, 1);
  st = { ...st, folders: r.folders };
  return r.id;
};
const pasta = mk("Pasta");
const cakes = mk("Cakes");
let t = 10;
for (const s of ["carbonara", "pesto", "lasagne"]) st = F.setRecipeInFolder(st, s, pasta, true, t++);
st = F.setRecipeInFolder(st, "brownies", cakes, true, t++);
st = F.favorite(st, "loose-one", t++);
st = F.favorite(st, "gone-recipe", t++);
// in a folder but no longer saved: not shared
st = F.setRecipeInFolder(st, "unsaved", pasta, true, t++);
st = { ...st, favorites: new Map([...st.favorites].filter(([s]) => s !== "unsaved")) };

const known = (s) => s !== "gone-recipe";
const one = buildShare(st, pasta, known);
assert.equal(one.kind, "folder");
assert.deepEqual(one.folders[0].items, ["lasagne", "pesto", "carbonara"]);
assert.equal(one.folders[0].name, "Pasta");
assert.deepEqual(one.loose, []);
assert.equal(buildShare(st, "nope"), null);

const all = buildShare(st, null, known);
assert.equal(all.kind, "all");
assert.deepEqual(all.folders.map((f) => f.name), ["Cakes", "Pasta"]);
assert.deepEqual(all.loose, ["loose-one"]);
assert.deepEqual(shareSlugs(all).sort(), ["brownies", "carbonara", "lasagne", "loose-one", "pesto"]);

// validateShare
const v = validateShare(JSON.parse(JSON.stringify(all)));
assert.ok(v.ok);
assert.deepEqual(v.doc, all);
assert.equal(validateShare({ kind: "folder", folders: [], loose: [] }).ok, false);
assert.equal(validateShare({ kind: "folder", folders: [{ name: "x", items: [] }] }).ok, false);
assert.equal(validateShare({ kind: "zzz", folders: [] }).ok, false);
assert.equal(validateShare(null).ok, false);
const dirty = validateShare({
  kind: "folder",
  folders: [{ name: " ".repeat(3), emoji: 5, color: "red", items: ["ok", "ok", "a b", 7, "../x"] }],
});
assert.ok(dirty.ok);
assert.deepEqual(dirty.doc.folders[0].items, ["ok"]);
assert.equal(dirty.doc.folders[0].name, "New folder");
assert.equal(dirty.doc.folders[0].color, "#d4451f");

// importShare into an empty kitchen
let r = importShare({ favorites: new Map(), folders: [] }, all, 1000);
assert.equal(r.newRecipes, 5);
assert.deepEqual(r.folders.map((f) => f.name), ["Cakes", "Pasta"]);
assert.deepEqual(r.folders[1].items.map((i) => i.slug), ["lasagne", "pesto", "carbonara"]);
assert.equal(r.folderIds.length, 2);
assert.equal(r.folderIds[1], r.folders[1].id);
assert.ok(r.favorites.has("loose-one"));

// importing again adds nothing; a same-named folder (any case) is reused
const again = importShare(r, all, 2000);
assert.equal(again.newRecipes, 0);
assert.equal(again.folders.length, 2);
let mine = { favorites: new Map([["mine", 1]]), folders: [] };
const made = F.createFolder(mine.folders, { name: "pasta" }, 1);
mine = { ...mine, folders: made.folders };
mine = F.setRecipeInFolder(mine, "mine", made.id, true, 1);
const merged = importShare(mine, one, 3000);
assert.equal(merged.folders.length, 1);
assert.equal(merged.folderIds[0], made.id);
assert.deepEqual(merged.folders[0].items.map((i) => i.slug), ["lasagne", "pesto", "carbonara", "mine"]);
assert.equal(merged.newRecipes, 3);

// folder cap: recipes still saved, not filed
let full = { favorites: new Map(), folders: [] };
for (let i = 0; i < 50; i++) full = { ...full, folders: F.createFolder(full.folders, { name: `F${i}` }, i).folders };
const capped = importShare(full, one, 5000);
assert.equal(capped.folders.length, 50);
assert.equal(capped.folderIds[0], null);
assert.equal(capped.newRecipes, 3);

console.log("share tests passed");
