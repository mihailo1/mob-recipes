import { createHash } from "node:crypto";

// Upstash Redis through its plain REST API, shared by the nearby, share and
// sync routes. Added from the Vercel Marketplace, which sets KV_REST_API_URL
// and KV_REST_API_TOKEN. Without it these features are off on Vercel; local
// dev uses in-memory stand ins (see each store).

const TIMEOUT_MS = 3000;

export function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}

/** "redis", "memory" (local dev only) or null when not configured. */
export function redisMode() {
  if (redisEnv()) return "redis";
  if (!process.env.VERCEL && process.env.NODE_ENV !== "production") return "memory";
  return null;
}

/** Salted hash for key names, so secrets and IPs never appear in Redis keys. */
export function hashKey(prefix, value) {
  const salt = redisEnv()?.token || "dev";
  const hash = createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 32);
  return `${prefix}:${hash}`;
}

/** Runs commands in one request. Returns each command's result. */
export async function pipeline(commands) {
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

// Local dev stand in for plain string keys: Map<key, { value, exp }>. On
// globalThis because dev builds load this module once per route.
const memory = (globalThis.__mobRecipesMemory ??= new Map());

export function memoryGet(key) {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.exp && hit.exp <= Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

export function memorySet(key, value, ttlS) {
  memory.set(key, { value, exp: ttlS ? Date.now() + ttlS * 1000 : 0 });
}

export function memoryDel(key) {
  memory.delete(key);
}

/**
 * Counts one hit for `key` in a fixed window. Returns false once more than
 * `limit` hits happened in the window (the caller should answer 429).
 */
export async function allowHit(key, limit, windowS) {
  if (redisMode() === "memory") {
    const n = (memoryGet(key) || 0) + 1;
    const hit = memory.get(key);
    memory.set(key, { value: n, exp: hit?.exp && n > 1 ? hit.exp : Date.now() + windowS * 1000 });
    return n <= limit;
  }
  const [n] = await pipeline([
    ["INCR", key],
    ["EXPIRE", key, String(windowS), "NX"],
  ]);
  return Number(n) <= limit;
}
