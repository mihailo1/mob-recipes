import { json, readJsonBody } from "../../../lib/push/http.js";
import { sameOriginOk } from "../../../lib/push/state.mjs";
import { allowFromNetwork } from "../../../lib/api-guard.js";
import { MAX_SHARE_BYTES, newShareId, validateShare } from "../../../lib/share.mjs";
import { putShare, storeMode } from "../../../lib/sync/store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { kind, folders, loose } (see lib/share.mjs): stores a copy of the
 * folders and answers { id } for the link /s/<id>.
 */
export async function POST(req) {
  if (!sameOriginOk(req.headers)) return json({ error: "forbidden" }, 403);
  if (!storeMode()) return json({ error: "not-configured" }, 503);
  const body = await readJsonBody(req, MAX_SHARE_BYTES);
  const parsed = body.ok ? validateShare(body.value) : { ok: false };
  if (!parsed.ok) return json({ error: "invalid-body" }, 400);
  try {
    if (!(await allowFromNetwork(req.headers, "share", 60, 3600))) {
      return json({ error: "rate-limited" }, 429);
    }
    const doc = JSON.stringify(parsed.doc);
    for (let i = 0; i < 3; i++) {
      const id = newShareId();
      if (await putShare(id, doc)) return json({ id });
    }
    return json({ error: "unavailable" }, 503);
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
