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
      "/api/admin/migrate": ["./prisma/migrations/**/*"],
      // Apply the trace include broadly so the fonts ship with
      // whichever serverless function happens to render a PDF
      // (both /sales/invoices/[id]/pdf and /purchases/bills/[id]/pdf
      // import lib/sales/pdf-document.tsx).
      "/**/*": ["./lib/sales/fonts/*.ttf"],
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
