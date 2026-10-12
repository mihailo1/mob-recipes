import { PUSH_LIMITS } from "../../../../lib/push/config.js";
import { json, readJsonBody } from "../../../../lib/push/http.js";
import {
  applySubscribe,
  applyUnsubscribe,
  validateSubscribeBody,
  validateUnsubscribeBody,
} from "../../../../lib/push/state.mjs";
import { isConfigured, readState, writeState } from "../../../../lib/push/store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NOT_CONFIGURED = { error: "not-configured" };
const UNAVAILABLE = { error: "unavailable" };
const INVALID = { error: "invalid-body" };

export async function POST(req) {
  if (!isConfigured()) return json(NOT_CONFIGURED, 503);
  const body = await readJsonBody(req);
  const parsed = body.ok ? validateSubscribeBody(body.value) : { ok: false };
  if (!parsed.ok) return json(INVALID, 400);

  try {
    const state = await readState();
    const r = applySubscribe(state, parsed.subscription, Date.now(), PUSH_LIMITS);
    if (r.result === "device-limit") return json({ error: "device-limit" }, 409);
    if (r.result === "rate-limit") return json({ error: "rate-limit" }, 429);
    // "unchanged" must not touch Blob: writes are the scarce resource.
    if (r.result !== "unchanged") await writeState(r.state);
    return json({ ok: true, devices: r.state.subs.length });
  } catch {
    return json(UNAVAILABLE, 503);
  }
}

export async function DELETE(req) {
  if (!isConfigured()) return json(NOT_CONFIGURED, 503);
  const body = await readJsonBody(req);
  const parsed = body.ok ? validateUnsubscribeBody(body.value) : { ok: false };
  if (!parsed.ok) return json(INVALID, 400);

  try {
    const state = await readState();
    const r = applyUnsubscribe(state, parsed.endpoint, Date.now(), PUSH_LIMITS);
    if (r.result === "rate-limit") return json({ error: "rate-limit" }, 429);
    if (r.result === "removed") await writeState(r.state);
    return json({ ok: true });
  } catch {
    return json(UNAVAILABLE, 503);
  }
}
