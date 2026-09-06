/** @type {import('next').NextConfig} */
const nextConfig = {
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
