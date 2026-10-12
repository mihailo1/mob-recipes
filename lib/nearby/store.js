import { KEY_TTL_S } from "../nearby.mjs";
import { hashKey, pipeline, redisMode } from "../redis.js";

// Short lived "who has which recipe open" entries, one Redis hash per network.
// Devices write every few seconds, which is far too often for Vercel Blob, so
// this uses Upstash Redis (see lib/redis.js). Without it the feature is off on
// Vercel; local dev keeps entries in memory.

/** "redis", "memory" (local dev only) or null when not configured. */
export const nearbyMode = redisMode;

/** Redis key for a network. The IP itself is never stored, only a salted hash. */
export function networkId(netKey) {
  return hashKey("nearby", netKey);
}

// Local dev stand in: Map<key, { fields: Map, exp }>.
const memory = new Map();
function memoryHash(key, now) {
  const cur = memory.get(key);
  if (cur && cur.exp > now) return cur;
  const fresh = { fields: new Map(), exp: 0 };
  memory.set(key, fresh);
  return fresh;
}

/** Stores this device's entry and returns every entry of the network as { device: raw }. */
export async function beat(key, device, entry) {
  if (nearbyMode() === "memory") {
    const now = Date.now();
    const h = memoryHash(key, now);
    h.fields.set(device, entry);
    h.exp = now + KEY_TTL_S * 1000;
    return Object.fromEntries(h.fields);
  }
  const [, , flat] = await pipeline([
    ["HSET", key, device, entry],
    ["EXPIRE", key, String(KEY_TTL_S)],
    ["HGETALL", key],
  ]);
  const fields = {};
  for (let i = 0; i + 1 < (flat || []).length; i += 2) fields[flat[i]] = flat[i + 1];
  return fields;
}

/** Removes devices from a network entry. */
export async function drop(key, devices) {
  if (!devices.length) return;
  if (nearbyMode() === "memory") {
    const h = memory.get(key);
    if (h) for (const d of devices) h.fields.delete(d);
    return;
  }
  await pipeline([["HDEL", key, ...devices]]);
}
