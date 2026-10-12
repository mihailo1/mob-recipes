import { PUSH_LIMITS } from "../../../../lib/push/config.js";
import { json, readJsonBody } from "../../../../lib/push/http.js";
import { createSender } from "../../../../lib/push/send.js";
import {
  applyNotifyEffects,
  executeNotify,
  safeEqual,
  validateNotifyBody,
} from "../../../../lib/push/state.mjs";
import { isConfigured, mutateState, readSnapshot } from "../../../../lib/push/store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(req, secret) {
  const header = req.headers.get("authorization") || "";
  const match = /^Bearer (.+)$/.exec(header);
  return !!match && safeEqual(match[1], secret);
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
    const now = Date.now();
    const snap = await readSnapshot();
    const r = await executeNotify(snap.state, {
      version: parsed.version,
      force: parsed.force,
      now,
      limits: PUSH_LIMITS,
      send,
    });
    // One write at most. On a conflict the same outcome is applied to a fresh
    // read; nothing is sent twice.
    if (r.nextState) {
      await mutateState((state) => ({ next: applyNotifyEffects(state, r.effects, now).nextState }), snap);
    }
    // Counts only: subscription endpoints and keys are credentials.
    console.log(`push notify ${r.status} ${r.reason ?? ""} delivered=${r.delivered ?? 0} pruned=${r.pruned ?? 0}`);
    if (r.status === "skipped") return json({ status: "skipped", reason: r.reason });
    if (r.status === "failed") return json({ status: "failed", delivered: 0, pruned: r.pruned }, 502);
    return json({ status: "sent", delivered: r.delivered, pruned: r.pruned });
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
