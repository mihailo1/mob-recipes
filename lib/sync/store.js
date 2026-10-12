import { PAIR_TTL_S, SYNC_TTL_S } from "../sync.mjs";
import { SHARE_TTL_S } from "../share.mjs";
import { hashKey, memoryDel, memoryGet, memorySet, pipeline, redisMode } from "../redis.js";

// Redis storage for device sync, pairing codes and shared folder links.
//
// sync:<hash of space>  hash { rev, doc }  the merged doc of a space and a
//                       counter that goes up on every change. The space id
//                       is the secret only the linked devices know, so the
//                       key is a salted hash of it.
// pair:<code>           "w:<space>" while waiting, "u:<space>" once used.
// share:<id>            a shared folder doc (JSON), read only.

export const storeMode = redisMode;

const spaceKey = (space) => hashKey("sync", space);
const pairKey = (code) => `pair:${code}`;
const shareKey = (id) => `share:${id}`;

const PULL = `
local r = redis.call('HGET', KEYS[1], 'rev')
if not r then return {} end
redis.call('EXPIRE', KEYS[1], ARGV[2])
if r == ARGV[1] then return {r} end
return {r, redis.call('HGET', KEYS[1], 'doc')}`;

const CAS = `
local r = redis.call('HGET', KEYS[1], 'rev')
if not r then return {-1} end
if r ~= ARGV[1] then return {0, r} end
local n = tostring(tonumber(r) + 1)
redis.call('HSET', KEYS[1], 'rev', n, 'doc', ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return {1, n}`;

const JOIN = `
local v = redis.call('GET', KEYS[1])
if not v or string.sub(v, 1, 2) ~= 'w:' then return false end
redis.call('SET', KEYS[1], 'u:' .. string.sub(v, 3), 'KEEPTTL')
return string.sub(v, 3)`;

/** Makes sure a space exists (an empty one with rev 0 when new). */
export async function ensureSpace(space) {
  const key = spaceKey(space);
  if (storeMode() === "memory") {
    if (!memoryGet(key)) memorySet(key, { rev: "0", doc: "" }, SYNC_TTL_S);
    return;
  }
  await pipeline([
    ["HSETNX", key, "rev", "0"],
    ["EXPIRE", key, String(SYNC_TTL_S)],
  ]);
}

/**
 * The stored doc of a space. Returns null for an unknown space, otherwise
 * { rev, doc } where doc is the raw JSON string ("" when nothing was stored
 * yet) or undefined when it is unchanged since `knownRev`.
 */
export async function readSpace(space, knownRev) {
  const key = spaceKey(space);
  if (storeMode() === "memory") {
    const hit = memoryGet(key);
    if (!hit) return null;
    return { rev: hit.rev, doc: hit.rev === knownRev ? undefined : hit.doc };
  }
  const [out] = await pipeline([["EVAL", PULL, "1", key, String(knownRev ?? ""), String(SYNC_TTL_S)]]);
  if (!Array.isArray(out) || !out.length) return null;
  return { rev: String(out[0]), doc: out.length > 1 ? out[1] || "" : undefined };
}

/**
 * Stores `docJson` if the space is still at `rev`. Returns { ok: true, rev }
 * with the new rev, { ok: false, rev } when someone else wrote first, or
 * null for an unknown space.
 */
export async function writeSpace(space, rev, docJson) {
  const key = spaceKey(space);
  if (storeMode() === "memory") {
    const hit = memoryGet(key);
    if (!hit) return null;
    if (hit.rev !== rev) return { ok: false, rev: hit.rev };
    const next = String(Number(rev) + 1);
    memorySet(key, { rev: next, doc: docJson }, SYNC_TTL_S);
    return { ok: true, rev: next };
  }
  const [out] = await pipeline([["EVAL", CAS, "1", key, rev, docJson, String(SYNC_TTL_S)]]);
  if (!Array.isArray(out) || Number(out[0]) === -1) return null;
  return { ok: Number(out[0]) === 1, rev: String(out[1]) };
}

/** Saves a waiting pairing code. False when the code is taken. */
export async function putPairCode(code, space) {
  const key = pairKey(code);
  if (storeMode() === "memory") {
    if (memoryGet(key)) return false;
    memorySet(key, `w:${space}`, PAIR_TTL_S);
    return true;
  }
  const [ok] = await pipeline([["SET", key, `w:${space}`, "NX", "EX", String(PAIR_TTL_S)]]);
  return ok === "OK";
}

/** Uses up a waiting code and returns its space, or null. */
export async function takePairCode(code) {
  const key = pairKey(code);
  if (storeMode() === "memory") {
    const v = memoryGet(key);
    if (typeof v !== "string" || !v.startsWith("w:")) return null;
    const hit = v.slice(2);
    // keep the expiry: re-set with whatever is left is close enough locally
    memorySet(key, `u:${hit}`, PAIR_TTL_S);
    return hit;
  }
  const [space] = await pipeline([["EVAL", JOIN, "1", key]]);
  return typeof space === "string" && space ? space : null;
}

/** "waiting", "used" or "expired" for a code made for `space`. */
export async function pairCodeState(code, space) {
  const key = pairKey(code);
  let v;
  if (storeMode() === "memory") v = memoryGet(key);
  else [v] = await pipeline([["GET", key]]);
  if (typeof v !== "string" || v.slice(2) !== space) return "expired";
  return v.startsWith("u:") ? "used" : "waiting";
}

/** Drops a code early (the person closed the code screen). */
export async function dropPairCode(code, space) {
  if ((await pairCodeState(code, space)) !== "waiting") return;
  const key = pairKey(code);
  if (storeMode() === "memory") memoryDel(key);
  else await pipeline([["DEL", key]]);
}

/** Stores a shared folder doc under a new id. False when the id is taken. */
export async function putShare(id, docJson) {
  const key = shareKey(id);
  if (storeMode() === "memory") {
    if (memoryGet(key)) return false;
    memorySet(key, docJson, SHARE_TTL_S);
    return true;
  }
  const [ok] = await pipeline([["SET", key, docJson, "NX", "EX", String(SHARE_TTL_S)]]);
  return ok === "OK";
}

/** The raw JSON of a shared doc, or null. */
export async function getShare(id) {
  const key = shareKey(id);
  if (storeMode() === "memory") return memoryGet(key);
  const [v] = await pipeline([["GET", key]]);
  return typeof v === "string" ? v : null;
}
