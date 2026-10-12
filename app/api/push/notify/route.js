import { createHash, timingSafeEqual } from "node:crypto";
import { PUSH_LIMITS } from "../../../../lib/push/config.js";
import { json, readJsonBody } from "../../../../lib/push/http.js";
import { createSender } from "../../../../lib/push/send.js";
import { executeNotify, validateNotifyBody } from "../../../../lib/push/state.mjs";
import { isConfigured, readState, writeState } from "../../../../lib/push/store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const sha256 = (s) => createHash("sha256").update(s).digest();

function authorized(req, secret) {
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer (.+)$/.exec(header);
  if (!match) return false;
  // Equal-length digests make the comparison constant-time regardless of input length.
  return timingSafeEqual(sha256(match[1]), sha256(secret));
}

export async function POST(req) {
  const secret = process.env.NOTIFY_SECRET;
  if (!secret || !isConfigured()) return json({ error: "not-configured" }, 503);
  if (!authorized(req, secret)) return json({ error: "unauthorized" }, 401);

  const body = await readJsonBody(req);
  const parsed = body.ok ? validateNotifyBody(body.value) : { ok: false };
  if (!parsed.ok) return json({ error: "invalid-body" }, 400);

  const send = createSender();
  if (!send) return json({ error: "not-configured" }, 503);

  try {
    const state = await readState();
    const r = await executeNotify(state, {
      version: parsed.version,
      force: parsed.force,
      now: Date.now(),
      limits: PUSH_LIMITS,
      send,
    });
    if (r.nextState) await writeState(r.nextState);
    // Counts only: subscription endpoints and keys are credentials.
    console.log(`push notify ${r.status} ${r.reason ?? ""} delivered=${r.delivered ?? 0} pruned=${r.pruned ?? 0}`);
    if (r.status === "skipped") return json({ status: "skipped", reason: r.reason });
    return json({ status: "sent", delivered: r.delivered, pruned: r.pruned });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
