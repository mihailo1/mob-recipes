// Pure Web Push logic: validation, state transitions, limits. No I/O, so it can
// be imported from node scripts and tests. Limits are passed in by the caller
// (see lib/push/config.js) as { maxDevices, gapMs, maxWrites }.

export const STATE_VERSION = 1;
export const MAX_BODY_BYTES = 4096;
export const MAX_ENDPOINT_LENGTH = 1000;

export const PUSH_TITLE = "Mob Recipes";

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

export function isValidP256dh(s) {
  const buf = decodeB64Url(s, 65, 87);
  return !!buf && buf[0] === 0x04;
}

export function isValidAuth(s) {
  return !!decodeB64Url(s, 16, 22);
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
export function validateNotifyBody(body) {
  if (!body || typeof body !== "object") return { ok: false };
  if (typeof body.version !== "string" || !VERSION_RE.test(body.version)) return { ok: false };
  if (body.force != null && typeof body.force !== "boolean") return { ok: false };
  return { ok: true, version: body.version, force: body.force === true };
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

/** Returns a clean state object, or null when the document is malformed. */
export function parseState(raw) {
  if (!raw || typeof raw !== "object" || raw.v !== STATE_VERSION) return null;
  if (!Array.isArray(raw.subs)) return null;
  const subs = [];
  for (const s of raw.subs) {
    if (!s || typeof s.endpoint !== "string" || !s.keys) return null;
    if (typeof s.keys.p256dh !== "string" || typeof s.keys.auth !== "string") return null;
    if (!isNum(s.addedAt)) return null;
    subs.push({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth }, addedAt: s.addedAt });
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
    subs[i] = { ...cur, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
    return { result: "updated", state: countWrite({ ...state, subs }, now) };
  }
  if (isFull(state, limits)) return { result: "device-limit", state };
  if (budgetExhausted(state, now, limits)) return { result: "rate-limit", state };
  const added = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    addedAt: now,
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

/** Returns { send: true } or { send: false, reason }. The server is the source of truth for the 24h gap. */
export function decideNotify(state, version, force, now, limits) {
  if (!force) {
    if (state.lastPush && state.lastPush.version === version) {
      return { send: false, reason: "already-sent" };
    }
    if (state.lastPush && now - state.lastPush.at < limits.gapMs) {
      return { send: false, reason: "daily-limit" };
    }
  }
  if (state.subs.length === 0) return { send: false, reason: "no-devices" };
  return { send: true };
}

/**
 * Runs a notify round. `send(sub, payload)` is injected and must resolve to
 * { ok: boolean, statusCode?: number } without throwing.
 * Returns { status, reason?, delivered?, pruned?, nextState }. `nextState` is
 * non-null only when something changed (one write covers prune + lastPush);
 * that write is exempt from the daily budget but still counted.
 */
export async function executeNotify(state, { version, force, now, limits, send }) {
  const decision = decideNotify(state, version, force, now, limits);
  if (!decision.send) return { status: "skipped", reason: decision.reason, nextState: null };

  const payload = buildPayload(version);
  const outcomes = await Promise.all(
    state.subs.map(async (sub) => {
      if (!isAllowedEndpoint(sub.endpoint)) return { sub, ok: false, gone: true };
      const r = await send(sub, payload);
      return { sub, ok: !!r.ok, gone: r.statusCode === 404 || r.statusCode === 410 };
    }),
  );
  const delivered = outcomes.filter((o) => o.ok).length;
  const goneEndpoints = new Set(outcomes.filter((o) => o.gone).map((o) => o.sub.endpoint));
  const pruned = goneEndpoints.size;

  if (delivered === 0 && pruned === 0) {
    return { status: "sent", delivered, pruned, nextState: null };
  }
  const next = {
    ...state,
    subs: state.subs.filter((s) => !goneEndpoints.has(s.endpoint)),
    lastPush: delivered > 0 ? { at: now, version } : state.lastPush,
  };
  return { status: "sent", delivered, pruned, nextState: countWrite(next, now) };
}
