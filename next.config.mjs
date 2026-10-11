/** @type {import('next').NextConfig} */
const nextConfig = {
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
