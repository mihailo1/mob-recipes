#!/usr/bin/env node
// Exercises lib/qr.mjs (what a scanned QR code means). No I/O.
// Usage: node scripts/test-qr.mjs   (exit code 1 on failure)
import assert from "node:assert/strict";
import { pairUrl, parseScan } from "../lib/qr.mjs";

const O = "https://mob-recipes.vercel.app";
assert.deepEqual(parseScan(pairUrl(O, "012345")), { type: "pair", code: "012345" });
assert.deepEqual(parseScan("012345"), { type: "pair", code: "012345" });
assert.equal(parseScan(`${O}/pool?pair=12345`), null);
assert.deepEqual(parseScan(`${O}/recipes/minestrone-soup`), { type: "open", path: "/recipes/minestrone-soup" });
assert.deepEqual(parseScan(`http://localhost:3111/recipes/hearty-rag%C3%B9/`), {
  type: "open",
  path: "/recipes/hearty-rag%C3%B9",
});
assert.deepEqual(parseScan(`look ${O}/s/AbCdEf2345 nice`), { type: "open", path: "/s/AbCdEf2345" });
assert.equal(parseScan(`${O}/s/short`), null);
assert.equal(parseScan(`${O}/favorites`), null);
assert.equal(parseScan("https://example.com/"), null);
assert.equal(parseScan("hello"), null);
assert.equal(parseScan(null), null);
console.log("qr tests passed");
