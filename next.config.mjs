/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
    // Include extra files in serverless function bundles when Next.js
    // would otherwise tree-shake them away (because they're not imported
    // as JS modules).
    //
    // In Next.js 14 this option lives under `experimental`; it was
    // promoted to a top-level option in Next.js 15. PR #269 placed it
    // at the top-level by mistake — Next silently warned "Unrecognized
    // key(s)" in the Vercel build log and ignored the rules entirely,
    // so the .ttf files never made it into the function bundles and
    // the invoice + bill PDF routes threw font ENOENT on prod.
    //
    // Why each entry exists:
    //  - migrations: the /api/admin/migrate route reads .sql files at runtime.
    //  - fonts: the invoice PDF renderer (`lib/sales/pdf-document.tsx`) calls
    //    `Font.register({ src: path.join(process.cwd(), "lib/sales/fonts", ...) })`
    //    so it can embed Noto Sans (PR #268) — needed for the ₹ glyph.
    outputFileTracingIncludes: {
      // Apply the trace include broadly so every serverless function
      // ships the resources it might need.
      //  - migration .sql files: `instrumentation.ts` runs on every
      //    route's cold-start and tries to apply pending migrations
      //    via `fs.readdir(process.cwd() + "/prisma/migrations")`. If
      //    the trace include only targets /api/admin/migrate, the
      //    auto-migrate silently fails on every other function bundle
      //    (root cause of the "DB schema out of sync" issue that
      //    surfaced as "bills page shows error" after PR #270).
      //  - fonts: any route that imports `lib/sales/pdf-document.tsx`
      //    needs Noto Sans on disk at render time (PR #268).
      "/**/*": [
        "./prisma/migrations/**/*",
        "./lib/sales/fonts/*.ttf",
      ],
    },
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
    ],
  },
};

export default config;
