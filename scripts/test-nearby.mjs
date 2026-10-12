#!/usr/bin/env node
// Exercises lib/nearby.mjs (pure nearby device logic). No I/O.
// Usage: node scripts/test-nearby.mjs   (exit code 1 on failure)
import assert from "node:assert/strict";
import {
  MAX_FIELDS,
  PEER_TTL_MS,
  clientIp,
  encodeEntry,
  networkKey,
  pickSuggestion,
  readPeers,
  validateBeat,
} from "../lib/nearby.mjs";

const DEV = "abcdefghijklmnop1234";

// validateBeat
assert.deepEqual(validateBeat({ device: DEV, slug: "spicy-noodles" }), {
  ok: true, device: DEV, slug: "spicy-noodles", leave: false,
});
assert.equal(validateBeat({ device: DEV }).slug, null);
assert.equal(validateBeat({ device: DEV, slug: "hearty-mushroom-and-lentil-rag%C3%B9" }).ok, true);
assert.equal(validateBeat({ device: DEV, leave: true }).leave, true);
assert.equal(validateBeat({ device: "short", slug: null }).ok, false);
assert.equal(validateBeat({ device: DEV, slug: "../etc" }).ok, false);
assert.equal(validateBeat({ device: DEV, slug: "a b" }).ok, false);
assert.equal(validateBeat({ device: DEV, slug: 5 }).ok, false);
assert.equal(validateBeat([DEV]).ok, false);
assert.equal(validateBeat(null).ok, false);

// clientIp
const h = (o) => new Headers(o);
assert.equal(clientIp(h({ "x-forwarded-for": "81.2.3.4, 10.0.0.1" })), "81.2.3.4");
assert.equal(clientIp(h({ "x-real-ip": "81.2.3.4" })), "81.2.3.4");
assert.equal(clientIp(h({})), null);

// networkKey: IPv4 whole address, IPv6 /64
assert.equal(networkKey("81.2.3.4"), "4:81.2.3.4");
assert.equal(networkKey("::ffff:81.2.3.4"), "4:81.2.3.4");
assert.equal(networkKey("300.1.1.1"), null);
assert.equal(
  networkKey("2a02:1810:abcd:1200:1c2d:3e4f:5a6b:7c8d"),
  networkKey("2a02:1810:abcd:1200::99"),
);
assert.equal(networkKey("2a02:1810:abcd:1200::99"), "6:2a02:1810:abcd:1200");
assert.notEqual(networkKey("2a02:1810:abcd:1200::1"), networkKey("2a02:1810:abcd:1201::1"));
assert.equal(networkKey("[2001:db8::1]"), "6:2001:0db8:0000:0000");
assert.equal(networkKey("fe80::1%en0"), "6:fe80:0000:0000:0000");
assert.equal(networkKey("1:2:3:4:5:6:7:8:9"), null);
assert.equal(networkKey("hello"), null);
assert.equal(networkKey(undefined), null);

// readPeers: self excluded, stale and broken entries dropped, newest first
const now = 1_000_000;
const r = readPeers(
  {
    me: encodeEntry("a", now),
    old: encodeEntry("b", now - PEER_TTL_MS - 1),
    junk: "{",
    bad: JSON.stringify({ s: "../x", t: now }),
    p1: encodeEntry("c", now - 3000),
    p2: encodeEntry(null, now - 1000),
  },
  "me",
  now,
);
assert.deepEqual(r.peers, [{ slug: null, ago: 1000 }, { slug: "c", ago: 3000 }]);
assert.deepEqual(r.stale.sort(), ["bad", "junk", "old"]);
// overflow beyond MAX_FIELDS is dropped, oldest first
const many = {};
for (let i = 0; i < MAX_FIELDS + 3; i++) many[`d${i}`] = encodeEntry("x", now - i);
const o = readPeers(many, "me", now);
assert.equal(o.peers.length, MAX_FIELDS - 1);
assert.deepEqual(o.stale.sort(), ["d11", "d12", "d13", "d14"]);

// pickSuggestion
const peers = [{ slug: null, ago: 0 }, { slug: "b", ago: 1 }, { slug: "c", ago: 2 }];
assert.equal(pickSuggestion(peers, null, null), "b");
assert.equal(pickSuggestion(peers, "b", null), "c"); // b is open here already
assert.equal(pickSuggestion([{ slug: "b", ago: 0 }], "b", null), null);
assert.equal(pickSuggestion(peers, "a", "b"), null); // dismissed
assert.equal(pickSuggestion([], "a", null), null);

console.log("nearby: all tests passed");
