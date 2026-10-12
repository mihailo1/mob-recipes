import { clientIp, networkKey } from "./nearby.mjs";
import { allowHit, hashKey } from "./redis.js";

/**
 * Rate limit by the caller's network (public IP, or IPv6 /64). Returns true
 * when the request may go on. Locally every client is one network.
 */
export async function allowFromNetwork(headers, kind, limit, windowS) {
  const ip = clientIp(headers);
  const net = ip ? networkKey(ip) : process.env.VERCEL ? null : "local";
  return allowHit(hashKey(`rl:${kind}`, net || "unknown"), limit, windowS);
}
