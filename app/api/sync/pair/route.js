import { json, readJsonBody } from "../../../../lib/push/http.js";
import { sameOriginOk } from "../../../../lib/push/state.mjs";
import { allowFromNetwork } from "../../../../lib/api-guard.js";
import { PAIR_TTL_S, isValidCode, isValidSpace, newPairCode, newSpaceId } from "../../../../lib/sync.mjs";
import {
  dropPairCode,
  ensureSpace,
  pairCodeState,
  putPairCode,
  storeMode,
  takePairCode,
} from "../../../../lib/sync/store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * Linking devices with a 6 digit code.
 *
 * POST { op: "create", space? } : a new code for `space` (a new space when
 *   none is given). Answers { code, space, ttl }.
 * POST { op: "join", code } : uses up the code and answers { space }.
 *   404 bad-code when it is wrong, used or expired. Tries are limited per
 *   network, so the 6 digits cannot be guessed in the 10 minutes a code lives.
 * POST { op: "status", code, space } : { state: waiting | used | expired }.
 * POST { op: "cancel", code, space } : drops a code nobody used yet.
 */
export async function POST(req) {
  if (!sameOriginOk(req.headers)) return json({ error: "forbidden" }, 403);
  if (!storeMode()) return json({ error: "not-configured" }, 503);
  const body = await readJsonBody(req, 512);
  const v = body.ok ? body.value : null;
  if (!v || typeof v !== "object") return json({ error: "invalid-body" }, 400);

  try {
    if (v.op === "create") {
      if (v.space !== undefined && !isValidSpace(v.space)) {
        return json({ error: "invalid-body" }, 400);
      }
      if (!(await allowFromNetwork(req.headers, "pair", 30, 3600))) {
        return json({ error: "rate-limited" }, 429);
      }
      const space = v.space || newSpaceId();
      await ensureSpace(space);
      for (let i = 0; i < 5; i++) {
        const code = newPairCode();
        if (await putPairCode(code, space)) return json({ code, space, ttl: PAIR_TTL_S });
      }
      return json({ error: "unavailable" }, 503);
    }
    if (v.op === "join") {
      if (!isValidCode(v.code)) return json({ error: "bad-code" }, 404);
      if (!(await allowFromNetwork(req.headers, "join", 10, 600))) {
        return json({ error: "rate-limited" }, 429);
      }
      const space = await takePairCode(v.code);
      return space ? json({ space }) : json({ error: "bad-code" }, 404);
    }
    if (v.op === "status" || v.op === "cancel") {
      if (!isValidCode(v.code) || !isValidSpace(v.space)) {
        return json({ error: "invalid-body" }, 400);
      }
      if (v.op === "cancel") {
        await dropPairCode(v.code, v.space);
        return json({ ok: true });
      }
      return json({ state: await pairCodeState(v.code, v.space) });
    }
    return json({ error: "invalid-body" }, 400);
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
