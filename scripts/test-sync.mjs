#!/usr/bin/env node
// Exercises lib/sync.mjs (device sync merge rules) and simulates devices
// talking to a server. No I/O.
// Usage: node scripts/test-sync.mjs   (exit code 1 on failure)
import assert from "node:assert/strict";
import {
  TOMBSTONE_TTL_MS,
  emptyDoc,
  isValidCode,
  isValidSpace,
  materialize,
  merge,
  newPairCode,
  newSpaceId,
  parseDoc,
  prune,
  stamp,
} from "../lib/sync.mjs";
import * as F from "../lib/folders.mjs";

const roundTrip = (doc) => parseDoc(JSON.parse(JSON.stringify(doc)));

// ids
for (let i = 0; i < 50; i++) {
  assert.ok(isValidSpace(newSpaceId()));
  assert.ok(isValidCode(newPairCode()));
}
assert.equal(isValidSpace("short"), false);
assert.equal(isValidCode("12345"), false);
assert.equal(isValidCode("12345a"), false);

/*
 * A tiny world: a server holding one doc, and devices that each keep app
 * state (what the store holds) plus the doc of their last sync. sync() does
 * what components/SyncEngine.jsx does, with the server step inlined.
 */
let clock = 1_000_000;
const tick = () => (clock += 1000);

function makeServer() {
  return { doc: emptyDoc(), rev: 0 };
}

function makeDevice(state = {}) {
  return {
    state: {
      pool: state.pool || new Set(),
      favorites: state.favorites || new Map(),
      folders: state.folders || [],
    },
    shadow: emptyDoc(),
    dirty: false,
  };
}

function serverMerge(server, incoming) {
  const parsed = roundTrip(incoming);
  assert.ok(parsed, "server must accept every doc a device sends");
  const { doc, changed } = merge(server.doc, parsed);
  const next = prune(doc, clock);
  if (changed) {
    server.doc = next;
    server.rev += 1;
  }
  return roundTrip(next);
}

function sync(dev, server) {
  const now = tick();
  const base = prune(dev.shadow, now);
  const { doc: mine, changed } = stamp(dev.state, base, now);
  // Send when something changed here, or the server lacked something last time.
  const s = changed || dev.dirty ? serverMerge(server, mine) : roundTrip(server.doc);
  const m = merge(s, mine);
  dev.shadow = m.doc;
  dev.state = materialize(m.doc);
  dev.dirty = m.changed;
  return m.changed;
}

function syncAll(devices, server) {
  for (let round = 0; round < 6; round++) {
    let dirty = false;
    for (const d of devices) dirty = sync(d, server) || dirty;
    if (!dirty && round > 0) return;
  }
}

const favs = (dev) => [...dev.state.favorites.keys()].sort();
const pool = (dev) => [...dev.state.pool].sort();
const folderView = (dev) =>
  dev.state.folders.map((f) => `${f.name}:${f.items.map((i) => i.slug).join(",")}`);

// Helpers that act like the store.
function favorite(dev, slug) {
  const next = F.favorite(dev.state, slug, tick());
  dev.state = { ...dev.state, ...next };
}
function unfavorite(dev, slug) {
  const { snapshot, ...next } = F.unfavorite(dev.state, slug, tick());
  dev.state = { ...dev.state, ...next };
}
function togglePool(dev, slug) {
  const p = new Set(dev.state.pool);
  p.has(slug) ? p.delete(slug) : p.add(slug);
  dev.state = { ...dev.state, pool: p };
}
function newFolder(dev, name) {
  const { folders, id } = F.createFolder(dev.state.folders, { name }, tick());
  dev.state = { ...dev.state, folders };
  return id;
}
function file(dev, slug, id, on = true) {
  const next = F.setRecipeInFolder(dev.state, slug, id, on, tick());
  dev.state = { ...dev.state, ...next };
}

// 1. First link: both devices keep everything (union), nothing is lost.
{
  const server = makeServer();
  const a = makeDevice();
  const b = makeDevice();
  favorite(a, "pasta");
  favorite(a, "soup");
  togglePool(a, "pasta");
  const fa = newFolder(a, "Weeknight");
  file(a, "soup", fa);
  favorite(b, "cake");
  togglePool(b, "cake");
  const fb = newFolder(b, "Baking");
  file(b, "cake", fb);
  syncAll([a, b], server);
  assert.deepEqual(favs(a), ["cake", "pasta", "soup"]);
  assert.deepEqual(favs(b), favs(a));
  assert.deepEqual(pool(a), ["cake", "pasta"]);
  assert.deepEqual(pool(b), pool(a));
  assert.deepEqual(folderView(a), folderView(b));
  assert.equal(a.state.folders.length, 2);

  // 2. A deletion reaches the other device and does not come back.
  unfavorite(a, "pasta");
  togglePool(b, "cake");
  syncAll([a, b], server);
  assert.deepEqual(favs(b), ["cake", "soup"]);
  assert.deepEqual(pool(a), ["pasta"]);
  assert.deepEqual(pool(b), ["pasta"]);
  syncAll([b, a], server);
  assert.deepEqual(favs(a), ["cake", "soup"]);

  // 3. Different changes at the same time both survive.
  favorite(a, "tacos");
  favorite(b, "ramen");
  unfavorite(b, "soup");
  syncAll([a, b], server);
  assert.deepEqual(favs(a), ["cake", "ramen", "tacos"]);
  assert.deepEqual(favs(b), favs(a));
  // soup was in a folder: un-favoriting removed it from the folder too
  assert.equal(a.state.folders.find((f) => f.id === fa).items.length, 0);

  // 4. Same thing changed on both: the later change wins.
  a.state = { ...a.state, folders: F.updateFolder(a.state.folders, fb, { name: "Cakes" }, tick()) };
  b.state = { ...b.state, folders: F.updateFolder(b.state.folders, fb, { name: "Sweet" }, tick()) };
  syncAll([a, b], server);
  assert.equal(a.state.folders.find((f) => f.id === fb).name, "Sweet");
  assert.equal(b.state.folders.find((f) => f.id === fb).name, "Sweet");

  // 5. Folder delete, reorder and a folder made on the other device.
  b.state = { ...b.state, folders: F.deleteFolder(b.state.folders, fa) };
  syncAll([a, b], server);
  assert.deepEqual(a.state.folders.map((f) => f.id), [fb]);
  const fc = newFolder(a, "Quick");
  syncAll([a, b], server);
  assert.deepEqual(b.state.folders.map((f) => f.id), [fc, fb]);
  b.state = { ...b.state, folders: F.moveFolder(b.state.folders, fc, 1) };
  syncAll([a, b], server);
  assert.deepEqual(a.state.folders.map((f) => f.id), [fb, fc]);

  // 6. Nothing to do: a sync with no change sends nothing and changes nothing.
  const rev = server.rev;
  syncAll([a, b], server);
  assert.equal(server.rev, rev);
  const st = stamp(a.state, a.shadow, tick());
  assert.equal(st.changed, false);
}

// 7. A third device joining late gets everything and adds its own.
{
  const server = makeServer();
  const a = makeDevice();
  const b = makeDevice();
  favorite(a, "one");
  syncAll([a, b], server);
  unfavorite(a, "one");
  syncAll([a, b], server);
  const c = makeDevice();
  favorite(c, "two");
  syncAll([c, a, b], server);
  for (const d of [a, b, c]) assert.deepEqual(favs(d), ["two"]);
}

// 8. Server reset (space expired and was made again): devices push back.
{
  const server = makeServer();
  const a = makeDevice();
  favorite(a, "keep-me");
  syncAll([a], server);
  server.doc = emptyDoc();
  server.rev = 0;
  // A device that only pulls must not wipe itself with the empty doc.
  syncAll([a], server);
  assert.deepEqual(favs(a), ["keep-me"]);
  assert.ok(server.doc.fav["keep-me"]);
}

// merge is order free and idempotent
{
  const a = emptyDoc();
  const b = emptyDoc();
  a.fav.x = [1, 5, 10];
  b.fav.x = [0, 5, 12];
  a.pool.p = [1, 3];
  b.pool.q = [1, 4];
  b.fav.y = [1, 7, 7];
  a.fav.y = [1, 8, 7]; // equal times: content decides, the same on both sides
  const ab = merge(a, b).doc;
  const ba = merge(b, a).doc;
  assert.deepEqual(roundTrip(ab), roundTrip(ba));
  assert.deepEqual(ab.fav.x, [0, 5, 12]);
  assert.deepEqual(ab.fav.y, ba.fav.y);
  assert.equal(merge(ab, ab).changed, false);
  assert.equal(merge(ab, a).changed, false);
}

// prune drops old tombstones only
{
  const d = emptyDoc();
  const now = 10 * TOMBSTONE_TTL_MS;
  d.pool.old = [0, now - TOMBSTONE_TTL_MS - 1];
  d.pool.recent = [0, now - 1000];
  d.pool.live = [1, 1];
  d.folders.gone = { on: [0, 1], look: ["x", "y", "#fff", 1], created: 1, items: Object.create(null) };
  d.order = [["gone"], 1];
  const p = prune(d, now);
  assert.deepEqual(Object.keys(p.pool).sort(), ["live", "recent"]);
  assert.equal(p.folders.gone, undefined);
  assert.deepEqual(p.order[0], []);
}

// parseDoc refuses anything off and never gets a polluted prototype
{
  const ok = emptyDoc();
  ok.fav["__proto__"] = [1, 1, 1];
  const parsed = parseDoc(JSON.parse(JSON.stringify(ok).replace('"fav":{', '"fav":{"__proto__":[1,1,1],')));
  assert.ok(parsed);
  assert.equal(Object.getPrototypeOf(parsed.fav), null);
  assert.equal(({}).polluted, undefined);
  assert.equal(parseDoc(null), null);
  assert.equal(parseDoc({ ...JSON.parse(JSON.stringify(emptyDoc())), v: 2 }), null);
  const bad = JSON.parse(JSON.stringify(emptyDoc()));
  bad.pool["a b"] = [1, 1];
  assert.equal(parseDoc(bad), null);
  const bad2 = JSON.parse(JSON.stringify(emptyDoc()));
  bad2.fav.x = [1, "1", 1];
  assert.equal(parseDoc(bad2), null);
  const bad3 = JSON.parse(JSON.stringify(emptyDoc()));
  bad3.folders["bad id!"] = { on: [1, 1], look: ["a", "b", "#fff", 1], created: 1, items: {} };
  assert.equal(parseDoc(bad3), null);
  const clean = JSON.parse(JSON.stringify(emptyDoc()));
  clean.folders.abc = { on: [1, 1], look: ["  " + "n".repeat(60), "", "red", 1], created: 1, items: {} };
  const c = parseDoc(clean);
  assert.equal(c.folders.abc.look[0].length, 40);
  assert.equal(c.folders.abc.look[2], "#d4451f");
}

// stamp never turns the folder cap into deletions
{
  const base = emptyDoc();
  for (let i = 0; i < 55; i++) {
    base.folders[`f${i}`] = {
      on: [1, 1],
      look: [`F${i}`, "x", "#fff", 1],
      created: i,
      items: Object.create(null),
    };
  }
  const view = materialize(base);
  assert.equal(view.folders.length, 50);
  const { changed } = stamp(view, base, 999);
  assert.equal(changed, false);
}

// Random changes on three devices with random sync order always end equal.
{
  let seed = 42;
  const rnd = (n) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const slugs = ["a", "b", "c", "d", "e", "f"];
  for (let run = 0; run < 200; run++) {
    const server = makeServer();
    const devs = [makeDevice(), makeDevice(), makeDevice()];
    for (let step = 0; step < 40; step++) {
      const d = devs[rnd(3)];
      const slug = slugs[rnd(slugs.length)];
      const op = rnd(8);
      if (op === 0) favorite(d, slug);
      else if (op === 1) unfavorite(d, slug);
      else if (op === 2) togglePool(d, slug);
      else if (op === 3 && d.state.folders.length < 4) newFolder(d, `F${rnd(3)}`);
      else if (op === 4 && d.state.folders.length) {
        file(d, slug, d.state.folders[rnd(d.state.folders.length)].id, rnd(2) === 0);
      } else if (op === 5 && d.state.folders.length) {
        d.state = { ...d.state, folders: F.deleteFolder(d.state.folders, d.state.folders[0].id) };
      } else if (op === 6 && d.state.folders.length > 1) {
        d.state = { ...d.state, folders: F.moveFolder(d.state.folders, d.state.folders[0].id, 1) };
      } else sync(d, server);
    }
    syncAll(devs, server);
    syncAll(devs, server);
    for (const d of devs.slice(1)) {
      assert.deepEqual(favs(d), favs(devs[0]));
      assert.deepEqual(pool(d), pool(devs[0]));
      assert.deepEqual(folderView(d), folderView(devs[0]));
    }
  }
}

console.log("sync tests passed");
