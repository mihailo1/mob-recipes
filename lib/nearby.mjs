// "Nearby device" logic: which recipe another device on the same Wi-Fi has
// open. Pure functions, no I/O, shared by the API route, the client and
// scripts/test-nearby.mjs.
//
// How "same Wi-Fi" is detected: devices behind one home router reach the
// internet from one public IPv4 address (or one IPv6 /64 network), so the
// server groups devices by that. It is a heuristic: with iCloud Private Relay
// on, or when one device uses IPv4 and the other IPv6, they will not match.

export const MAX_BODY_BYTES = 512;
export const BEAT_FAST_MS = 5000; // another device was seen recently
export const BEAT_SLOW_MS = 15000; // alone on the network
export const BEAT_RETRY_MS = 30000; // after a failed request
export const PEER_TTL_MS = 25000; // a device that stopped beating is gone after this
export const KEY_TTL_S = 60; // the whole network entry expires after this
export const MAX_FIELDS = 12; // devices remembered per network

const DEVICE_RE = /^[A-Za-z0-9_-]{16,40}$/;
// Recipe slugs as stored in the index: ASCII, some percent-encoded.
const SLUG_RE = /^[A-Za-z0-9%._-]{1,160}$/;

export function isValidDevice(s) {
  return typeof s === "string" && DEVICE_RE.test(s);
}

export function isValidSlug(s) {
  return typeof s === "string" && SLUG_RE.test(s);
}

/** { ok, device, slug, leave }. slug is null when no recipe is open. */
export function validateBeat(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false };
  if (!isValidDevice(body.device)) return { ok: false };
  if (body.leave === true) return { ok: true, device: body.device, slug: null, leave: true };
  const slug = body.slug ?? null;
  if (slug !== null && !isValidSlug(slug)) return { ok: false };
  return { ok: true, device: body.device, slug, leave: false };
}

/** The caller's public IP from the proxy headers, or null. */
export function clientIp(headers) {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim() || null;
  return headers.get("x-real-ip") || null;
}

function expandIpv6(ip) {
  const [head, tail = null] = ip.split("::");
  const a = head ? head.split(":") : [];
  const b = tail === null ? [] : tail ? tail.split(":") : [];
  const fill = tail === null ? 0 : 8 - a.length - b.length;
  if (fill < 0) return null;
  const groups = [...a, ...Array(fill).fill("0"), ...b];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => g.padStart(4, "0"));
}

/**
 * Which "network" an IP belongs to: the full address for IPv4 and the /64
 * prefix for IPv6 (each phone gets its own IPv6 address inside the home
 * network). Null when the address cannot be parsed.
 */
export function networkKey(ip) {
  if (typeof ip !== "string") return null;
  let s = ip.trim().toLowerCase();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  s = s.split("%")[0]; // zone id
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (v4) {
    const parts = v4[1].split(".").map(Number);
    return parts.every((n) => n <= 255) ? `4:${parts.join(".")}` : null;
  }
  if (!s.includes(":")) return null;
  const groups = expandIpv6(s);
  return groups ? `6:${groups.slice(0, 4).join(":")}` : null;
}

/** What one device stores for itself. */
export function encodeEntry(slug, now) {
  return JSON.stringify({ s: slug, t: now });
}

/**
 * Turns the stored { device: entry } map into the peers of `self`, newest
 * first, as [{ slug, ago }], plus the fields that can go: stale ones and any
 * beyond MAX_FIELDS (so one network can never grow without bound).
 */
export function readPeers(fields, self, now) {
  const peers = [];
  const stale = [];
  for (const [device, raw] of Object.entries(fields || {})) {
    let e = null;
    try {
      e = JSON.parse(raw);
    } catch {
      e = null;
    }
    const ok = e && typeof e.t === "number" && (e.s === null || isValidSlug(e.s));
    if (!ok || now - e.t > PEER_TTL_MS) {
      stale.push(device);
      continue;
    }
    if (device !== self) peers.push({ device, slug: e.s, ago: Math.max(0, now - e.t) });
  }
  peers.sort((a, b) => a.ago - b.ago);
  for (const p of peers.splice(MAX_FIELDS - 1)) stale.push(p.device);
  return { peers: peers.map(({ slug, ago }) => ({ slug, ago })), stale };
}

/**
 * The recipe to offer on this device: the most recently reported one from
 * another device that is not already open here and was not dismissed.
 */
export function pickSuggestion(peers, current, dismissed) {
  for (const p of peers || []) {
    if (!p.slug || p.slug === current) continue;
    return p.slug === dismissed ? null : p.slug;
  }
  return null;
}
