import { PUSH_LIMITS } from "../../../../lib/push/config.js";
import { json, readJsonBody } from "../../../../lib/push/http.js";
import {
  accessCodeOk,
  sameOriginOk,
  applySubscribe,
  applyUnsubscribe,
  validateSubscribeBody,
  validateUnsubscribeBody,
} from "../../../../lib/push/state.mjs";
import { isConfigured, mutateState } from "../../../../lib/push/store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BAD_CODE = { error: "bad-code" };
const NOT_CONFIGURED = { error: "not-configured" };
const UNAVAILABLE = { error: "unavailable" };
const INVALID = { error: "invalid-body" };

// Checked first, before the body is read and before any storage access, so
// callers without the code can never cause a Blob read or write.
function codeOk(req) {
  return (
    sameOriginOk(req.headers) &&
    accessCodeOk(req.headers.get("x-push-code"), process.env.SUBSCRIBE_CODE)
  );
}

export async function POST(req) {
  if (!codeOk(req)) return json(BAD_CODE, 401);
  if (!isConfigured()) return json(NOT_CONFIGURED, 503);
  const body = await readJsonBody(req);
  const parsed = body.ok ? validateSubscribeBody(body.value) : { ok: false };
  if (!parsed.ok) return json(INVALID, 400);

  const now = Date.now();
  try {
    const r = await mutateState((state) => {
      const t = applySubscribe(state, parsed.subscription, now, PUSH_LIMITS);
      // "unchanged" must not touch Blob: writes are the scarce resource.
      const write = t.result === "added" || t.result === "updated";
      return { result: t.result, devices: t.state.subs.length, next: write ? t.state : null };
    });
    if (r.result === "device-limit") return json({ error: "device-limit" }, 409);
    if (r.result === "rate-limit") return json({ error: "rate-limit" }, 429);
    return json({ ok: true, devices: r.devices });
  } catch {
    return json(UNAVAILABLE, 503);
  }
}

export async function DELETE(req) {
  if (!codeOk(req)) return json(BAD_CODE, 401);
  if (!isConfigured()) return json(NOT_CONFIGURED, 503);
  const body = await readJsonBody(req);
  const parsed = body.ok ? validateUnsubscribeBody(body.value) : { ok: false };
  if (!parsed.ok) return json(INVALID, 400);

  const now = Date.now();
  try {
    const r = await mutateState((state) => {
      const t = applyUnsubscribe(state, parsed.endpoint, now, PUSH_LIMITS);
      return { result: t.result, next: t.result === "removed" ? t.state : null };
    });
    if (r.result === "rate-limit") return json({ error: "rate-limit" }, 429);
    return json({ ok: true });
  } catch {
    return json(UNAVAILABLE, 503);
  }
}
