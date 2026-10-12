// What a scanned QR code means for the app. Pure, shared by the scanner
// (components/share/QrScanner.jsx) and scripts/test-qr.mjs.
//
// Codes the app shows:
//   <origin>/recipes/<slug>    a recipe
//   <origin>/s/<id>            a shared folder link
//   <origin>/pool?pair=<code>  linking devices for sync
// Scanning inside the app opens them in the app itself; the iPhone Camera
// would open them in Safari, which keeps its own storage.

import { isValidSlug } from "./nearby.mjs";
import { isValidShareId } from "./share.mjs";
import { isValidCode } from "./sync.mjs";

export const PAIR_PARAM = "pair";

/** The QR content for linking devices with `code`. */
export function pairUrl(origin, code) {
  return `${origin}/pool?${PAIR_PARAM}=${code}`;
}

/** "/recipes/<slug>" or "/s/<id>" for an app path, else null. */
export function appPath(pathname) {
  if (typeof pathname !== "string") return null;
  let m = /^\/recipes\/([^/?#]+)\/?$/.exec(pathname);
  if (m && isValidSlug(m[1])) return `/recipes/${m[1]}`;
  m = /^\/s\/([^/?#]+)\/?$/.exec(pathname);
  if (m && isValidShareId(m[1])) return `/s/${m[1]}`;
  return null;
}

/**
 * { type: "pair", code } | { type: "open", path } | null for scanned or
 * pasted text. Links may come from any host the app runs on (prod, a
 * preview, localhost), so only the path and query are looked at.
 */
export function parseScan(text) {
  if (typeof text !== "string") return null;
  const t = text.trim();
  if (isValidCode(t)) return { type: "pair", code: t };
  const m = /https?:\/\/[^\s]+/.exec(t);
  if (!m) return null;
  let url;
  try {
    url = new URL(m[0]);
  } catch {
    return null;
  }
  const code = url.searchParams.get(PAIR_PARAM);
  if (code !== null) return isValidCode(code) ? { type: "pair", code } : null;
  const path = appPath(url.pathname);
  return path ? { type: "open", path } : null;
}
