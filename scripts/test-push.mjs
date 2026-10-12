#!/usr/bin/env node
// Exercises lib/push/state.mjs (pure Web Push logic). No network, no Blob.
// Usage: node scripts/test-push.mjs   (exit code 1 on failure)
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  applySubscribe,
  applyUnsubscribe,
  buildPayload,
  decideNotify,
  emptyState,
  executeNotify,
  isAllowedEndpoint,
  isValidAuth,
  isValidP256dh,
  parseState,
  shortVersion,
  validateNotifyBody,
  validateSubscribeBody,
  validateUnsubscribeBody,
} from "../lib/push/state.mjs";

const LIMITS = { maxDevices: 5, gapMs: 24 * 60 * 60 * 1000, maxWrites: 20 };
const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const DAY = LIMITS.gapMs;

const p256dh = () => Buffer.concat([Buffer.from([0x04]), randomBytes(64)]).toString("base64url");
const auth = () => randomBytes(16).toString("base64url");
const keys = () => ({ p256dh: p256dh(), auth: auth() });
const ep = (n) => `https://fcm.googleapis.com/fcm/send/device-${n}`;
const sub = (n) => ({ endpoint: ep(n), keys: keys() });

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL ${name}\n${err.stack}`);
  }
}

function withDevices(n, extra = {}) {
  let s = emptyState();
  for (let i = 0; i < n; i++) s = applySubscribe(s, sub(i), NOW, LIMITS).state;
  return { ...s, writes: { day: "", n: 0 }, ...extra };
}

await test("endpoint allowlist accepts real push services", () => {
  const ok = [
    "https://web.push.apple.com/QAbc123-_",
    "https://api.push.apple.com/3/device/abc",
    "https://fcm.googleapis.com/fcm/send/abc:APA91b-_x",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://autopush.push.services.mozilla.com/wpush/v2/x",
    "https://db5p.notify.windows.com/?token=AwYAAAA%3d",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
  ];
  for (const e of ok) assert.equal(isAllowedEndpoint(e), true, e);
});

await test("endpoint allowlist rejects http, IPs, localhost, lookalikes", () => {
  const bad = [
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://127.0.0.1/x",
    "https://[::1]/x",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/x",
    "https://web.push.apple.com.evil.com/x",
    "https://evilfcm.googleapis.com/x",
    "https://fcm.googleapis.com.evil.com/x",
    "https://evil.com/fcm.googleapis.com",
    "https://evil.com/?h=web.push.apple.com",
    "https://push.apple.com/x",
    "https://notify.windows.com/x",
    "https://xpush.apple.com/x",
    "https://web.push.apple.com@evil.com/x",
    "https://evil.com@web.push.apple.com/x",
    "https://web.push.apple.com\\@evil.com/x",
    "https://web.push.apple.com:8443/x",
    "https://WEB.PUSH.APPLE.COM/x",
    "https://web.push.apple.com/a b",
    "https://web.push.apple.com/a\nb",
    "https://fcm.googleapis.com/#frag",
    "ftp://fcm.googleapis.com/x",
    "//fcm.googleapis.com/x",
    "",
    "not a url",
    null,
    undefined,
    42,
    { href: "https://fcm.googleapis.com/x" },
    "https://fcm.googleapis.com/" + "a".repeat(1000),
  ];
  for (const e of bad) assert.equal(isAllowedEndpoint(e), false, String(e).slice(0, 60));
});

await test("key validation", () => {
  assert.equal(isValidP256dh(p256dh()), true);
  assert.equal(isValidAuth(auth()), true);
  assert.equal(isValidP256dh(Buffer.concat([Buffer.from([0x02]), randomBytes(64)]).toString("base64url")), false, "must start 0x04");
  assert.equal(isValidP256dh(randomBytes(64).toString("base64url")), false, "wrong length");
  assert.equal(isValidP256dh(p256dh() + "="), false, "padding");
  assert.equal(isValidP256dh(p256dh().replace(/.$/, "+")), false, "not base64url");
  assert.equal(isValidAuth(randomBytes(17).toString("base64url")), false);
  assert.equal(isValidAuth(randomBytes(15).toString("base64url")), false);
  assert.equal(isValidAuth(""), false);
  assert.equal(isValidAuth(null), false);
  assert.equal(isValidAuth(123), false);
});

await test("subscribe body validation", () => {
  const good = { subscription: { ...sub(1), expirationTime: null } };
  const r = validateSubscribeBody(good);
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.subscription).sort(), ["endpoint", "keys"]);
  assert.equal(validateSubscribeBody({ subscription: { ...sub(1), expirationTime: 12345 } }).ok, true);
  assert.equal(validateSubscribeBody({ subscription: { ...sub(1), expirationTime: "x" } }).ok, false);
  assert.equal(validateSubscribeBody({}).ok, false);
  assert.equal(validateSubscribeBody(null).ok, false);
  assert.equal(validateSubscribeBody([]).ok, false);
  assert.equal(validateSubscribeBody({ subscription: { endpoint: ep(1) } }).ok, false);
  assert.equal(validateSubscribeBody({ subscription: { endpoint: "https://evil.com/x", keys: keys() } }).ok, false);
  assert.equal(validateSubscribeBody({ subscription: { endpoint: ep(1), keys: { p256dh: "x", auth: auth() } } }).ok, false);
});

await test("unsubscribe and notify body validation", () => {
  assert.equal(validateUnsubscribeBody({ endpoint: ep(1) }).ok, true);
  assert.equal(validateUnsubscribeBody({ endpoint: "" }).ok, false);
  assert.equal(validateUnsubscribeBody({}).ok, false);
  assert.equal(validateUnsubscribeBody({ endpoint: "x".repeat(1001) }).ok, false);
  assert.deepEqual(validateNotifyBody({ version: "0.4.2" }), { ok: true, version: "0.4.2", force: false });
  assert.equal(validateNotifyBody({ version: "0.4.2", force: true }).force, true);
  assert.equal(validateNotifyBody({ version: "0.4.2", force: "yes" }).ok, false);
  assert.equal(validateNotifyBody({ version: "latest" }).ok, false);
  assert.equal(validateNotifyBody({}).ok, false);
  assert.equal(validateNotifyBody(null).ok, false);
});

await test("subscribe adds a new device and counts one write", () => {
  const r = applySubscribe(emptyState(), sub(1), NOW, LIMITS);
  assert.equal(r.result, "added");
  assert.equal(r.state.subs.length, 1);
  assert.equal(r.state.subs[0].addedAt, NOW);
  assert.deepEqual(r.state.writes, { day: "2026-10-12", n: 1 });
});

await test("same endpoint and keys: unchanged, no write counted", () => {
  const s = sub(1);
  const first = applySubscribe(emptyState(), s, NOW, LIMITS);
  const again = applySubscribe(first.state, { endpoint: s.endpoint, keys: { ...s.keys } }, NOW + 1000, LIMITS);
  assert.equal(again.result, "unchanged");
  assert.equal(again.state, first.state, "state object must be the very same (caller skips write)");
  assert.equal(again.state.writes.n, 1);
});

await test("dedupe works even when the write budget is spent or devices are full", () => {
  const full = withDevices(5, { writes: { day: "2026-10-12", n: 20 } });
  const r = applySubscribe(full, full.subs[2], NOW, LIMITS);
  assert.equal(r.result, "unchanged");
});

await test("same endpoint with new keys: updated, counts a write, device count unchanged", () => {
  const s = sub(1);
  const first = applySubscribe(emptyState(), s, NOW, LIMITS);
  const fresh = { endpoint: s.endpoint, keys: keys() };
  const r = applySubscribe(first.state, fresh, NOW + 1, LIMITS);
  assert.equal(r.result, "updated");
  assert.equal(r.state.subs.length, 1);
  assert.deepEqual(r.state.subs[0].keys, fresh.keys);
  assert.equal(r.state.subs[0].addedAt, NOW, "addedAt preserved");
  assert.equal(r.state.writes.n, 2);
});

await test("device cap: 6th rejected, existing re-subscribe still fine", () => {
  const s = withDevices(5);
  assert.equal(s.subs.length, 5);
  const sixth = applySubscribe(s, sub(99), NOW, LIMITS);
  assert.equal(sixth.result, "device-limit");
  assert.equal(sixth.state, s);
  assert.equal(applySubscribe(s, s.subs[0], NOW, LIMITS).result, "unchanged");
  const upd = applySubscribe(s, { endpoint: s.subs[0].endpoint, keys: keys() }, NOW, LIMITS);
  assert.equal(upd.result, "updated");
  assert.equal(upd.state.subs.length, 5);
});

await test("write budget: exhausted blocks subscribe and delete, resets next UTC day", () => {
  const s = withDevices(2, { writes: { day: "2026-10-12", n: 19 } });
  const a = applySubscribe(s, sub(50), NOW, LIMITS);
  assert.equal(a.result, "added");
  assert.equal(a.state.writes.n, 20);
  assert.equal(applySubscribe(a.state, sub(51), NOW, LIMITS).result, "rate-limit");
  assert.equal(applySubscribe(a.state, { endpoint: a.state.subs[0].endpoint, keys: keys() }, NOW, LIMITS).result, "rate-limit");
  assert.equal(applyUnsubscribe(a.state, a.state.subs[0].endpoint, NOW, LIMITS).result, "rate-limit");
  const nextDay = NOW + DAY;
  const b = applySubscribe(a.state, sub(52), nextDay, LIMITS);
  assert.equal(b.result, "added");
  assert.deepEqual(b.state.writes, { day: "2026-10-13", n: 1 });
});

await test("unsubscribe is idempotent and writes only when something is removed", () => {
  const s = withDevices(2);
  const r1 = applyUnsubscribe(s, s.subs[0].endpoint, NOW, LIMITS);
  assert.equal(r1.result, "removed");
  assert.equal(r1.state.subs.length, 1);
  assert.equal(r1.state.writes.n, 1);
  const r2 = applyUnsubscribe(r1.state, s.subs[0].endpoint, NOW, LIMITS);
  assert.equal(r2.result, "noop");
  assert.equal(r2.state, r1.state);
  assert.equal(applyUnsubscribe(emptyState(), ep(1), NOW, LIMITS).result, "noop");
});

await test("short version drops one trailing .0", () => {
  assert.equal(shortVersion("0.4.0"), "0.4");
  assert.equal(shortVersion("0.4.2"), "0.4.2");
  assert.equal(shortVersion("1.0.0"), "1.0");
  assert.equal(shortVersion("0.10.0"), "0.10");
  assert.equal(shortVersion("0.4.10"), "0.4.10");
  assert.deepEqual(buildPayload("0.5.0"), {
    title: "Mob Recipes",
    body: "Version 0.5 is ready. Open the app to update.",
    url: "/",
    tag: "mob-update",
  });
});

await test("notify decision: no devices, already-sent, daily-limit, force", () => {
  const empty = emptyState();
  assert.deepEqual(decideNotify(empty, "0.4.2", false, NOW, LIMITS), { send: false, reason: "no-devices" });
  assert.deepEqual(decideNotify(empty, "0.4.2", true, NOW, LIMITS), { send: false, reason: "no-devices" });

  const s = withDevices(1);
  assert.deepEqual(decideNotify(s, "0.4.2", false, NOW, LIMITS), { send: true });

  const sent = { ...s, lastPush: { at: NOW - 3 * DAY, version: "0.4.2" } };
  assert.deepEqual(decideNotify(sent, "0.4.2", false, NOW, LIMITS), { send: false, reason: "already-sent" });
  assert.deepEqual(decideNotify(sent, "0.4.2", true, NOW, LIMITS), { send: true });
  assert.deepEqual(decideNotify(sent, "0.4.3", false, NOW, LIMITS), { send: true });

  const recent = { ...s, lastPush: { at: NOW - 1000, version: "0.4.1" } };
  assert.deepEqual(decideNotify(recent, "0.4.2", false, NOW, LIMITS), { send: false, reason: "daily-limit" });
  assert.deepEqual(decideNotify(recent, "0.4.2", true, NOW, LIMITS), { send: true });
});

await test("daily limit boundary at exactly 24h", () => {
  const s = withDevices(1);
  const at = (ago) => ({ ...s, lastPush: { at: NOW - ago, version: "0.4.1" } });
  assert.equal(decideNotify(at(DAY - 1), "0.4.2", false, NOW, LIMITS).reason, "daily-limit");
  assert.equal(decideNotify(at(DAY), "0.4.2", false, NOW, LIMITS).send, true);
  assert.equal(decideNotify(at(DAY + 1), "0.4.2", false, NOW, LIMITS).send, true);
});

const okSend = async () => ({ ok: true });
const run = (state, send, over = {}) =>
  executeNotify(state, { version: "0.4.2", force: false, now: NOW, limits: LIMITS, send, ...over });

await test("notify sends to every device, records lastPush, one write", async () => {
  const s = withDevices(3, { writes: { day: "2026-10-12", n: 4 } });
  const seen = [];
  const r = await run(s, async (d, payload) => {
    seen.push([d.endpoint, payload]);
    return { ok: true };
  });
  assert.equal(r.status, "sent");
  assert.equal(r.delivered, 3);
  assert.equal(r.pruned, 0);
  assert.equal(seen.length, 3);
  assert.equal(seen[0][1].body, "Version 0.4.2 is ready. Open the app to update.");
  assert.deepEqual(r.nextState.lastPush, { at: NOW, version: "0.4.2" });
  assert.equal(r.nextState.writes.n, 5);
});

await test("notify final write is exempt from the budget but still counted", async () => {
  const s = withDevices(1, { writes: { day: "2026-10-12", n: 20 } });
  const r = await run(s, okSend);
  assert.equal(r.status, "sent");
  assert.equal(r.nextState.writes.n, 21);
});

await test("notify prunes 404 and 410 devices, keeps others", async () => {
  const s = withDevices(4);
  const [a, b, c, d] = s.subs.map((x) => x.endpoint);
  const codes = { [a]: 404, [b]: 410, [c]: 500 };
  const r = await run(s, async (dev) => (dev.endpoint === d ? { ok: true } : { ok: false, statusCode: codes[dev.endpoint] }));
  assert.equal(r.delivered, 1);
  assert.equal(r.pruned, 2);
  assert.deepEqual(r.nextState.subs.map((x) => x.endpoint), [c, d]);
  assert.deepEqual(r.nextState.lastPush, { at: NOW, version: "0.4.2" });
});

await test("lastPush recorded only on success; prune still written", async () => {
  const s = withDevices(2, { lastPush: { at: NOW - 5 * DAY, version: "0.4.0" } });
  const allFail = await run(s, async () => ({ ok: false, statusCode: 500 }));
  assert.equal(allFail.status, "sent");
  assert.equal(allFail.delivered, 0);
  assert.equal(allFail.nextState, null, "nothing changed, no write");

  const timeout = await run(s, async () => ({ ok: false }));
  assert.equal(timeout.nextState, null);

  const allGone = await run(s, async () => ({ ok: false, statusCode: 410 }));
  assert.equal(allGone.delivered, 0);
  assert.equal(allGone.pruned, 2);
  assert.equal(allGone.nextState.subs.length, 0);
  assert.deepEqual(allGone.nextState.lastPush, { at: NOW - 5 * DAY, version: "0.4.0" }, "old lastPush kept");
});

await test("notify skip paths never call send and never write", async () => {
  let calls = 0;
  const send = async () => (calls++, { ok: true });
  const s = withDevices(1, { lastPush: { at: NOW - 1000, version: "0.4.1" } });
  const r = await run(s, send);
  assert.equal(r.status, "skipped");
  assert.equal(r.reason, "daily-limit");
  assert.equal(r.nextState, null);
  const none = await run(emptyState(), send);
  assert.equal(none.reason, "no-devices");
  assert.equal(calls, 0);
});

await test("force bypasses daily limit and already-sent", async () => {
  const s = withDevices(1, { lastPush: { at: NOW - 1000, version: "0.4.2" } });
  const r = await run(s, okSend, { force: true });
  assert.equal(r.status, "sent");
  assert.equal(r.delivered, 1);
});

await test("stored endpoints off the allowlist are pruned, never sent to", async () => {
  const s = withDevices(1);
  s.subs.push({ endpoint: "https://evil.example.com/x", keys: keys(), addedAt: NOW });
  const targets = [];
  const r = await run(s, async (d) => (targets.push(d.endpoint), { ok: true }));
  assert.deepEqual(targets, [s.subs[0].endpoint]);
  assert.equal(r.pruned, 1);
  assert.equal(r.nextState.subs.length, 1);
});

await test("parseState accepts good docs and rejects malformed ones", () => {
  const s = withDevices(2, { lastPush: { at: NOW, version: "0.4.2" } });
  assert.deepEqual(parseState(JSON.parse(JSON.stringify(s))), s);
  assert.deepEqual(parseState(JSON.parse(JSON.stringify(emptyState()))), emptyState());
  for (const bad of [null, [], "x", {}, { v: 2, subs: [], lastPush: null, writes: { day: "", n: 0 } },
    { v: 1, subs: "no", lastPush: null, writes: { day: "", n: 0 } },
    { v: 1, subs: [{ endpoint: 1 }], lastPush: null, writes: { day: "", n: 0 } },
    { v: 1, subs: [], lastPush: { at: "x" }, writes: { day: "", n: 0 } },
    { v: 1, subs: [], lastPush: null },
    { v: 1, subs: [], lastPush: null, writes: { day: 5, n: 0 } }]) {
    assert.equal(parseState(bad), null, JSON.stringify(bad));
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
