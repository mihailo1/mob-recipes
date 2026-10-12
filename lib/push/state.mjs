// Pure Web Push logic: validation, state transitions, limits. No I/O, so it can
// be imported from node scripts and tests. Limits are passed in by the caller
// (see lib/push/config.js) as { maxDevices, gapMs, maxWrites }.

import { ECDH, createHash, timingSafeEqual } from "node:crypto";

export const STATE_VERSION = 1;
export const MAX_BODY_BYTES = 4096;
export const MAX_ENDPOINT_LENGTH = 1000;

export const PUSH_TITLE = "Mob Recipes";

// A device whose push service keeps answering with a hard error (no status,
// 400, 401, 403) is dropped after this many notify rounds in a row.
export const MAX_FAILS = 3;

export function emptyState() {
  return { v: STATE_VERSION, subs: [], lastPush: null, writes: { day: "", n: 0 } };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

// Real push services only. Anything else is rejected so user input can never
// steer an outbound request to an arbitrary host (SSRF).
const EXACT_HOSTS = new Set(["fcm.googleapis.com", "updates.push.services.mozilla.com"]);
const HOST_SUFFIXES = [".push.apple.com", ".push.services.mozilla.com", ".notify.windows.com"];
const LABEL = "[a-z0-9]([a-z0-9-]*[a-z0-9])?";

// Strict ASCII shape: https, lowercase dotted host, no port, no userinfo, no
// backslashes or whitespace. This keeps the WHATWG URL parser and the legacy
// parser used inside web-push in agreement about the host.
const ENDPOINT_RE = new RegExp(
  `^https://(${LABEL}(?:\\.${LABEL})+)(/[A-Za-z0-9\\-._~!$&'()*+,;=:@%/?]*)?$`,
);

export function isAllowedHost(host) {
  if (EXACT_HOSTS.has(host)) return true;
  return HOST_SUFFIXES.some((s) => host.length > s.length && host.endsWith(s));
}

export function isAllowedEndpoint(endpoint) {
  if (typeof endpoint !== "string" || endpoint.length > MAX_ENDPOINT_LENGTH) return false;
  const m = ENDPOINT_RE.exec(endpoint);
  if (!m || !isAllowedHost(m[1])) return false;
  try {
    return new URL(endpoint).hostname === m[1];
  } catch {
    return false;
  }
}

const B64URL_RE = /^[A-Za-z0-9_-]+$/;

function decodeB64Url(s, bytes, chars) {
  if (typeof s !== "string" || s.length !== chars || !B64URL_RE.test(s)) return null;
  const buf = Buffer.from(s, "base64url");
  return buf.length === bytes ? buf : null;
}

/** Uncompressed P-256 public key that is a real point on the curve. */
export function isValidP256dh(s) {
  const buf = decodeB64Url(s, 65, 87);
  if (!buf || buf[0] !== 0x04) return false;
  try {
    ECDH.convertKey(buf, "prime256v1");
    return true;
  } catch {
    return false;
  }
}

export function isValidAuth(s) {
  return !!decodeB64Url(s, 16, 22);
}

// ---------------------------------------------------------------------------
// Secrets and environment
// ---------------------------------------------------------------------------

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest();

/** Constant time string comparison: equal length digests, whatever the inputs. */
export function safeEqual(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  return timingSafeEqual(sha256(provided), sha256(expected));
}

/** Access code gate for subscribe. No code configured means open registration. */
export function accessCodeOk(provided, expected) {
  if (!expected) return true;
  return safeEqual(provided, expected);
}

/**
 * Browser-only guard for subscribe/unsubscribe: the request must come from a
 * page of this same site. Browsers always send Sec-Fetch-Site (and Origin on
 * POST/DELETE) and scripts cannot forge them; curl and bots send neither, so
 * they are refused before any storage access.
 */
export function sameOriginOk(headers) {
  const site = headers.get("sec-fetch-site");
  if (site) return site === "same-origin";
  const origin = headers.get("origin");
  const host = headers.get("x-forwarded-host") || headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * "blob", "file" (local testing only) or null when no storage is usable.
 * The file store is used in dev, or in a local production build when
 * PUSH_ALLOW_FILE_STORE=1 is set. It is never enabled on Vercel.
 */
export function storageModeFromEnv(env) {
  // Newer Blob stores authenticate with OIDC and only expose BLOB_STORE_ID; older ones use the token.
  if (env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID) return "blob";
  if (env.VERCEL) return null;
  if (env.NODE_ENV !== "production") return "file";
  if (env.PUSH_ALLOW_FILE_STORE === "1") return "file";
  return null;
}

/** Storage is usable and both server secrets are present. Reads env only. */
export function isConfiguredEnv(env) {
  return storageModeFromEnv(env) !== null && !!env.VAPID_PRIVATE_KEY && !!env.NOTIFY_SECRET;
}

/** Body of GET /api/push/status. A pure function of env: no storage I/O. */
export function pushStatus(env) {
  return { configured: isConfiguredEnv(env), codeRequired: !!env.SUBSCRIBE_CODE };
}

/** Validates the body of POST /api/push/subscribe. Returns { ok, subscription } or { ok: false }. */
export function validateSubscribeBody(body) {
  const sub = body && typeof body === "object" ? body.subscription : null;
  if (!sub || typeof sub !== "object") return { ok: false };
  const { endpoint, keys, expirationTime } = sub;
  if (!isAllowedEndpoint(endpoint)) return { ok: false };
  if (!keys || typeof keys !== "object") return { ok: false };
  if (!isValidP256dh(keys.p256dh) || !isValidAuth(keys.auth)) return { ok: false };
  if (expirationTime != null && typeof expirationTime !== "number") return { ok: false };
  return { ok: true, subscription: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } } };
}

/** Validates the body of DELETE /api/push/subscribe. */
export function validateUnsubscribeBody(body) {
  const endpoint = body && typeof body === "object" ? body.endpoint : null;
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > MAX_ENDPOINT_LENGTH) {
    return { ok: false };
  }
  return { ok: true, endpoint };
}

const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

/** Validates the body of POST /api/push/notify. */
const CUSTOM_TITLE_MAX = 60;
const CUSTOM_BODY_MAX = 200;
const CUSTOM_ICON_RE = /^\/push\/[A-Za-z0-9._-]{1,80}\.(png|jpe?g|webp)$/;

/** A hand-written message: { body, title?, url?, icon? }. url must be a path on this site. icon is a file under public/push/. */
function validateCustom(c) {
  if (!c || typeof c !== "object" || typeof c.body !== "string") return null;
  const body = c.body.trim();
  if (!body || body.length > CUSTOM_BODY_MAX) return null;
  let title = PUSH_TITLE;
  if (c.title != null) {
    if (typeof c.title !== "string") return null;
    title = c.title.trim() || PUSH_TITLE;
    if (title.length > CUSTOM_TITLE_MAX) return null;
  }
  let url = "/";
  if (c.url != null) {
    if (typeof c.url !== "string" || !/^\/(?!\/)[^\s\\]*$/.test(c.url) || c.url.length > 200) return null;
    url = c.url;
  }
  const out = { title, body, url, tag: "mob-custom" };
  if (c.icon != null) {
    // Any other value makes the whole custom payload invalid.
    if (typeof c.icon !== "string" || !CUSTOM_ICON_RE.test(c.icon)) return null;
    out.icon = c.icon;
  }
  return out;
}

export function validateNotifyBody(body) {
  if (!body || typeof body !== "object") return { ok: false };
  if (body.custom != null) {
    const custom = validateCustom(body.custom);
    return custom ? { ok: true, custom, version: null, force: false } : { ok: false };
  }
  if (typeof body.version !== "string" || !VERSION_RE.test(body.version)) return { ok: false };
  if (body.force != null && typeof body.force !== "boolean") return { ok: false };
  return { ok: true, version: body.version, force: body.force === true };
}

/** Numeric semver compare of "x.y.z" strings: -1, 0 or 1. Anything else compares equal. */
export function compareVersions(a, b) {
  if (!VERSION_RE.test(a) || !VERSION_RE.test(b)) return 0;
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  }
  return 0;
}

/** "0.4.0" becomes "0.4", "0.4.2" stays. */
export function shortVersion(version) {
  return String(version).replace(/\.0$/, "");
}

export function buildPayload(version) {
  return {
    title: PUSH_TITLE,
    body: `Version ${shortVersion(version)} is ready. Open the app to update.`,
    url: "/",
    tag: "mob-update",
  };
}

// ---------------------------------------------------------------------------
// State document
// ---------------------------------------------------------------------------

const isNum = (n) => typeof n === "number" && Number.isFinite(n);
const isCount = (n) => Number.isInteger(n) && n >= 0;

/** Returns a clean state object, or null when the document is malformed. */
export function parseState(raw) {
  if (!raw || typeof raw !== "object" || raw.v !== STATE_VERSION) return null;
  if (!Array.isArray(raw.subs)) return null;
  const subs = [];
  for (const s of raw.subs) {
    if (!s || typeof s.endpoint !== "string" || !s.keys) return null;
    if (typeof s.keys.p256dh !== "string" || typeof s.keys.auth !== "string") return null;
    if (!isNum(s.addedAt)) return null;
    if (s.fails != null && !isCount(s.fails)) return null;
    subs.push({
      endpoint: s.endpoint,
      keys: { p256dh: s.keys.p256dh, auth: s.keys.auth },
      addedAt: s.addedAt,
      fails: s.fails ?? 0,
    });
  }
  let lastPush = null;
  if (raw.lastPush != null) {
    if (!isNum(raw.lastPush.at) || typeof raw.lastPush.version !== "string") return null;
    lastPush = { at: raw.lastPush.at, version: raw.lastPush.version };
  }
  const w = raw.writes;
  if (!w || typeof w.day !== "string" || !isNum(w.n)) return null;
  return { v: STATE_VERSION, subs, lastPush, writes: { day: w.day, n: w.n } };
}

export function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10);
}

/** Writes already used today (UTC). Resets when the day changes. */
export function writesToday(state, now) {
  return state.writes.day === utcDay(now) ? state.writes.n : 0;
}

export function budgetExhausted(state, now, limits) {
  return writesToday(state, now) >= limits.maxWrites;
}

/** Returns a copy of the state with this write counted against today's budget. */
export function countWrite(state, now) {
  return { ...state, writes: { day: utcDay(now), n: writesToday(state, now) + 1 } };
}

export function isFull(state, limits) {
  return state.subs.length >= limits.maxDevices;
}

// ---------------------------------------------------------------------------
// Transitions. Each returns { result, state }. A changed state means the
// caller must write it; `unchanged`, `noop` and refusals never write.
// ---------------------------------------------------------------------------

export function applySubscribe(state, sub, now, limits) {
  const i = state.subs.findIndex((s) => s.endpoint === sub.endpoint);
  if (i >= 0) {
    const cur = state.subs[i];
    if (cur.keys.p256dh === sub.keys.p256dh && cur.keys.auth === sub.keys.auth) {
      return { result: "unchanged", state };
    }
    if (budgetExhausted(state, now, limits)) return { result: "rate-limit", state };
    const subs = state.subs.slice();
    subs[i] = { ...cur, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, fails: 0 };
    return { result: "updated", state: countWrite({ ...state, subs }, now) };
  }
  if (isFull(state, limits)) return { result: "device-limit", state };
  if (budgetExhausted(state, now, limits)) return { result: "rate-limit", state };
  const added = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    addedAt: now,
    fails: 0,
  };
  return { result: "added", state: countWrite({ ...state, subs: [...state.subs, added] }, now) };
}

export function applyUnsubscribe(state, endpoint, now, limits) {
  if (!state.subs.some((s) => s.endpoint === endpoint)) return { result: "noop", state };
  if (budgetExhausted(state, now, limits)) return { result: "rate-limit", state };
  const subs = state.subs.filter((s) => s.endpoint !== endpoint);
  return { result: "removed", state: countWrite({ ...state, subs }, now) };
}

// ---------------------------------------------------------------------------
// Notify
// ---------------------------------------------------------------------------

/**
 * Returns { send: true } or { send: false, reason }. The server is the source
 * of truth for the 24h gap. `force` bypasses everything except no-devices.
 */
export function decideNotify(state, version, force, now, limits) {
  const last = state.lastPush;
  if (!force && last) {
    if (last.version === version) return { send: false, reason: "already-sent" };
    if (compareVersions(version, last.version) < 0) return { send: false, reason: "older-version" };
    if (now - last.at < limits.gapMs) return { send: false, reason: "daily-limit" };
  }
  if (state.subs.length === 0) return { send: false, reason: "no-devices" };
  return { send: true };
}

/**
 * Maps one send result to "ok", "gone" (404/410, prune now), "transient"
 * (429, 5xx, leave as is) or "hard" (no status, 400, 401, 403 and other
 * client errors, counts towards MAX_FAILS).
 */
export function classifySend(r) {
  if (r && r.ok) return "ok";
  const code = r ? r.statusCode : undefined;
  if (code === 404 || code === 410) return "gone";
  if (code === 429 || (typeof code === "number" && code >= 500)) return "transient";
  return "hard";
}

/**
 * Applies the outcome of a notify round to a state. Pure, so it can be applied
 * again to a fresher state after a write conflict without sending twice.
 * `effects` is { version, results: Map<endpoint, kind> }.
 * Returns { nextState, pruned }; nextState is null when nothing changed.
 */
export function applyNotifyEffects(state, effects, now) {
  let changed = false;
  let pruned = 0;
  let delivered = 0;
  for (const kind of effects.results.values()) if (kind === "ok") delivered++;
  const subs = [];
  for (const s of state.subs) {
    const kind = effects.results.get(s.endpoint);
    const fails = s.fails ?? 0;
    if (kind === "gone") {
      changed = true;
      pruned++;
    } else if (kind === "hard") {
      changed = true;
      if (fails + 1 >= MAX_FAILS) pruned++;
      else subs.push({ ...s, fails: fails + 1 });
    } else if (kind === "ok" && fails !== 0) {
      changed = true;
      subs.push({ ...s, fails: 0 });
    } else {
      // ok with no failures, transient, or a device added after the round.
      subs.push(s);
    }
  }
  let lastPush = state.lastPush;
  // Hand-written messages (version null) must not use up the update-alert slot.
  if (delivered > 0 && effects.version) {
    lastPush = { at: now, version: effects.version };
    changed = true;
  }
  if (!changed) return { nextState: null, pruned };
  return { nextState: countWrite({ ...state, subs, lastPush }, now), pruned };
}

/**
 * Runs a notify round. `send(sub, payload)` is injected and should resolve to
 * { ok: boolean, statusCode?: number }.
 * Returns { status, reason?, delivered?, pruned?, effects?, nextState }.
 * status is "skipped", "sent" (delivered > 0) or "failed" (devices exist but
 * nothing was delivered). `nextState` is non-null only when something changed
 * (one write covers prune, fail counters and lastPush); that write is exempt
 * from the daily budget but still counted.
 */
export async function executeNotify(state, { version, force, now, limits, send, custom }) {
  let decision;
  if (custom) {
    // Sent by the owner on purpose: no version checks and no daily limit.
    decision = state.subs.length ? { send: true } : { send: false, reason: "no-devices" };
  } else {
    decision = decideNotify(state, version, force, now, limits);
  }
  if (!decision.send) return { status: "skipped", reason: decision.reason, nextState: null };

  const payload = custom || buildPayload(version);
  const outcomes = await Promise.all(
    state.subs.map(async (sub) => {
      if (!isAllowedEndpoint(sub.endpoint)) return [sub.endpoint, "gone"];
      let r;
      try {
        r = await send(sub, payload);
      } catch {
        r = { ok: false };
      }
      return [sub.endpoint, classifySend(r)];
    }),
  );
  const effects = { version: custom ? null : version, results: new Map(outcomes) };
  const delivered = outcomes.filter(([, kind]) => kind === "ok").length;
  const { nextState, pruned } = applyNotifyEffects(state, effects, now);
  return { status: delivered > 0 ? "sent" : "failed", delivered, pruned, effects, nextState };
}
