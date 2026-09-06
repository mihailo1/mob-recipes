/** @type {import('next').NextConfig} */
const nextConfig = {
  // data/recipes.json is read at runtime via fs.readFileSync (dynamic path),
  // so Next's file tracer won't pick it up on its own — the serverless
  // function for /api/recipe/[slug] would 404 in production without this.
  experimental: {
    outputFileTracingIncludes: {
      "/api/recipe/[slug]": ["./data/recipes.json"],
    },
  },
  images: {
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
