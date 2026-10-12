import { readFileSync } from "node:fs";

// Single source of truth for the app version: package.json. public/sw.js has
// no build step, so it repeats the version in `const VERSION`; a mismatch
// fails the build (a stale SW version would never trigger the update prompt).
const APP_VERSION = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version;
const SW_VERSION = readFileSync(new URL("./public/sw.js", import.meta.url), "utf8").match(
  /const VERSION = "([^"]+)"/,
)?.[1];
if (SW_VERSION !== APP_VERSION) {
  const msg = `public/sw.js VERSION (${SW_VERSION}) must equal package.json version (${APP_VERSION})`;
  if (process.env.NODE_ENV === "production") throw new Error(msg);
  console.warn(`Warning: ${msg}`);
}

// A silent release (no update banner) must be marked in both places, so a
// forgotten SILENT_UPDATE = true can never leak into the next normal release.
const SW_SILENT =
  readFileSync(new URL("./public/sw.js", import.meta.url), "utf8").match(
    /const SILENT_UPDATE = (true|false);/,
  )?.[1] === "true";
const { CHANGELOG } = await import("./lib/changelog.js");
if (SW_SILENT !== (CHANGELOG[0]?.silent === true)) {
  const msg = "SILENT_UPDATE in public/sw.js must match `silent` on the newest lib/changelog.js entry";
  if (process.env.NODE_ENV === "production") throw new Error(msg);
  console.warn(`Warning: ${msg}`);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
  },
  // data/recipes.json is read at runtime via fs.readFileSync (dynamic path),
  // so Next's file tracer won't pick it up on its own — the serverless
  // function for /api/recipe/[slug] would 404 in production without this.
  outputFileTracingIncludes: {
    "/api/recipe/[slug]": ["./data/recipes.json"],
  },
  async headers() {
    return [
      {
        // The service worker must never be served stale, or updates stall.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
  images: {
    // Only webp (no avif) to keep transformation usage low on Vercel Hobby.
    formats: ["image/webp"],
    minimumCacheTTL: 2678400, // 31 days
    // Next 16 no longer includes 16 by default. Must cover every w used in
    // components/RecipeImage.jsx (16 preview; 256/384/640/828/1200).
    imageSizes: [16, 256, 384],
    deviceSizes: [640, 828, 1200],
    // Must cover every q used in components/RecipeImage.jsx.
    qualities: [30, 70],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "mob-cdn.ams3.digitaloceanspaces.com",
      },
      {
        protocol: "https",
        hostname: "www.mob.co.uk",
      },
    ],
  },
};

export default nextConfig;
