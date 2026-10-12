import { PUSH_LIMITS } from "../../../../lib/push/config.js";
import { json } from "../../../../lib/push/http.js";
import { isFull } from "../../../../lib/push/state.mjs";
import { isConfigured, readState } from "../../../../lib/push/store.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isConfigured()) return json({ configured: false, full: false });
  try {
    const state = await readState();
    return json({ configured: true, full: isFull(state, PUSH_LIMITS) });
  } catch {
    return json({ configured: false, full: false });
  }
}
