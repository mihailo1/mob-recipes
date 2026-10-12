import { json, readJsonBody } from "../../../lib/push/http.js";
import { sameOriginOk } from "../../../lib/push/state.mjs";
import {
  BEAT_FAST_MS,
  BEAT_SLOW_MS,
  MAX_BODY_BYTES,
  clientIp,
  encodeEntry,
  networkKey,
  readPeers,
  validateBeat,
} from "../../../lib/nearby.mjs";
import { beat, drop, nearbyMode, networkId } from "../../../lib/nearby/store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Locally there are no proxy headers: every dev client is one "network".
function callerNetwork(headers) {
  const ip = clientIp(headers);
  if (!ip) return process.env.VERCEL ? null : "local";
  return networkKey(ip);
}

/**
 * POST { device, slug } : "this device has `slug` open" (null: none). Answers
 * { peers: [{ slug, ago }], next } with what the other devices on the same
 * network have open and when to ask again.
 * POST { device, leave: true } : this device closed the app.
 */
export async function POST(req) {
  if (!sameOriginOk(req.headers)) return json({ error: "forbidden" }, 403);
  if (!nearbyMode()) return json({ error: "not-configured" }, 503);
  const body = await readJsonBody(req, MAX_BODY_BYTES);
  const parsed = body.ok ? validateBeat(body.value) : { ok: false };
  if (!parsed.ok) return json({ error: "invalid-body" }, 400);

  const net = callerNetwork(req.headers);
  if (!net) return json({ peers: [], next: BEAT_SLOW_MS });
  const key = networkId(net);
  const now = Date.now();
  try {
    if (parsed.leave) {
      await drop(key, [parsed.device]);
      return json({ ok: true });
    }
    const fields = await beat(key, parsed.device, encodeEntry(parsed.slug, now));
    const { peers, stale } = readPeers(fields, parsed.device, now);
    // Forget devices that went quiet or overflow the cap.
    if (stale.length) await drop(key, stale);
    return json({ peers, next: peers.length ? BEAT_FAST_MS : BEAT_SLOW_MS });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
