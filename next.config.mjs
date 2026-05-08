/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
  // Include migration SQL files in the /api/admin/migrate serverless
  // function bundle so it can read them at runtime. Without this hint,
  // Next.js tree-shakes them out (they're not imported as JS modules).
  outputFileTracingIncludes: {
    "/api/admin/migrate": ["./prisma/migrations/**/*"],
  },
};

export default config;
