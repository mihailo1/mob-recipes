import { json } from "../../../../lib/push/http.js";
import { pushStatus } from "../../../../lib/push/state.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Reads env only, never storage: this endpoint is public and must not cost
// any Blob operation.
export function GET() {
  return json(pushStatus(process.env));
}
