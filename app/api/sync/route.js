import { json, readJsonBody } from "../../../lib/push/http.js";
import { sameOriginOk } from "../../../lib/push/state.mjs";
import {
  MAX_SYNC_BYTES,
  emptyDoc,
  isValidSpace,
  merge,
  parseDoc,
  prune,
} from "../../../lib/sync.mjs";
import { readSpace, storeMode, writeSpace } from "../../../lib/sync/store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REV_RE = /^\d{1,15}$/;

function storedDoc(raw) {
  if (!raw) return emptyDoc();
  try {
    return parseDoc(JSON.parse(raw)) || emptyDoc();
  } catch {
    return emptyDoc();
  }
}

/**
 * POST { space, rev } : anything new since `rev`? Answers { rev } when not,
 * else { rev, doc } (doc null while the space is still empty).
 * POST { space, rev, doc } : merges this device's doc into the stored one
 * and answers { rev, doc } with the result.
 * 404 unknown-space: the space expired or never existed.
 */
export async function POST(req) {
  if (!sameOriginOk(req.headers)) return json({ error: "forbidden" }, 403);
  if (!storeMode()) return json({ error: "not-configured" }, 503);
  const body = await readJsonBody(req, MAX_SYNC_BYTES + 1024);
  const v = body.ok ? body.value : null;
  if (!v || typeof v !== "object" || !isValidSpace(v.space)) {
    return json({ error: "invalid-body" }, 400);
  }
  const rev = REV_RE.test(v.rev ?? "") ? v.rev : null;
  const incoming = v.doc === undefined ? null : parseDoc(v.doc);
  if (v.doc !== undefined && !incoming) return json({ error: "invalid-body" }, 400);

  try {
    if (!incoming) {
      const cur = await readSpace(v.space, rev);
      if (!cur) return json({ error: "unknown-space" }, 404);
      if (cur.doc === undefined) return json({ rev: cur.rev });
      return json({ rev: cur.rev, doc: cur.doc ? storedDoc(cur.doc) : null });
    }
    // Someone else may write between our read and write: retry on conflict.
    for (let i = 0; i < 4; i++) {
      const cur = await readSpace(v.space, null);
      if (!cur) return json({ error: "unknown-space" }, 404);
      const stored = storedDoc(cur.doc);
      const { doc: merged, changed } = merge(stored, incoming);
      const next = prune(merged, Date.now());
      if (!changed && cur.doc) return json({ rev: cur.rev, doc: next });
      const text = JSON.stringify(next);
      if (text.length > MAX_SYNC_BYTES) return json({ error: "too-large" }, 413);
      const w = await writeSpace(v.space, cur.rev, text);
      if (!w) return json({ error: "unknown-space" }, 404);
      if (w.ok) return json({ rev: w.rev, doc: next });
    }
    return json({ error: "busy" }, 503);
  } catch {
    return json({ error: "unavailable" }, 503);
  }
}
