import { createHash } from "node:crypto";
import { KEY_TTL_S } from "../nearby.mjs";

// Short lived "who has which recipe open" entries, one Redis hash per network.
// Devices write every few seconds, which is far too often for Vercel Blob, so
// this uses Upstash Redis (added from the Vercel Marketplace, which sets
// KV_REST_API_URL and KV_REST_API_TOKEN) through its plain REST API. Without
// it the feature is off on Vercel; local dev keeps entries in memory.

const TIMEOUT_MS = 3000;

function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

/** "redis", "memory" (local dev only) or null when not configured. */
export function nearbyMode() {
  if (redisEnv()) return "redis";
  if (!process.env.VERCEL && process.env.NODE_ENV !== "production") return "memory";
  return null;
}

/** Redis key for a network. The IP itself is never stored, only a salted hash. */
export function networkId(netKey) {
  const salt = redisEnv()?.token || "dev";
  const hash = createHash("sha256").update(`${salt}:${netKey}`).digest("hex").slice(0, 32);
  return `nearby:${hash}`;
}

async function pipeline(commands) {
  const { url, token } = redisEnv();
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  const out = await res.json();
  for (const r of out) if (r.error) throw new Error("redis command failed");
  return out.map((r) => r.result);
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
