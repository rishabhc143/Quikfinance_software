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
  // Include extra files in serverless function bundles when Next.js
  // would otherwise tree-shake them away (because they're not imported
  // as JS modules).
  //
  // Why each entry exists:
  //  - migrations: the /api/admin/migrate route reads .sql files at runtime.
  //  - fonts: the invoice PDF renderer (`lib/sales/pdf-document.tsx`) calls
  //    `Font.register({ src: path.join(__dirname, "fonts", "*.ttf") })` so
  //    it can embed Noto Sans (PR #268). In production __dirname resolves
  //    to .next/server/chunks/; we need the .ttf files copied there too.
  outputFileTracingIncludes: {
    "/api/admin/migrate": ["./prisma/migrations/**/*"],
    // Any route that imports `lib/sales/pdf-document.tsx` triggers a
    // Font.register call that reads the .ttf files from disk at render
    // time. Apply the trace include broadly (all auth-gated dashboard
    // routes) so the fonts ship with whichever serverless function
    // happens to render a PDF.
    "/**/*": ["./lib/sales/fonts/*.ttf"],
  },
};

export default config;
