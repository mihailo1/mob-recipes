// Injected at build time from package.json by next.config.mjs.
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.0.0";

/** Compares "1.2.3" style versions. Returns -1, 0 or 1. */
export function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** "0.3.0" -> "0.3" for display. */
export function shortVersion(v) {
  return String(v).replace(/\.0$/, "");
}
