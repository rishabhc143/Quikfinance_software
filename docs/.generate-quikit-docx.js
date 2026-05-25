/* eslint-disable */
// Generator: docs/quikit-integration.md  ->  docs/quikit-integration.docx
// Run from C:\Users\user\Quikfinance:
//   node --experimental-vm-modules docs/.generate-quikit-docx.js
// Uses the globally-installed `docx` package (npm i -g docx).

const path = require("path");
const fs = require("fs");
// Resolved from the local project install (pnpm add -D docx).
const docxPath = path.join(__dirname, "..", "node_modules", "docx");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  AlignmentType,
  PageNumber,
  LevelFormat,
  HeadingLevel,
  BorderStyle,
  WidthType,
  ShadingType,
  PageOrientation,
} = require(docxPath);

// US Letter, 1" margins -> content width = 9360 DXA
const CONTENT_WIDTH = 9360;
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function P(text, opts = {}) {
  const runs = Array.isArray(text)
    ? text
    : [new TextRun({ text, font: "Arial", ...opts.run })];
  return new Paragraph({
    children: runs,
    spacing: { after: 120 },
    ...opts.paragraph,
  });
}

function H1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [
      new TextRun({ text, bold: true, size: 36, color: "1F2937", font: "Arial" }),
    ],
    spacing: { before: 360, after: 180 },
  });
}

function H2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [
      new TextRun({ text, bold: true, size: 28, color: "374151", font: "Arial" }),
    ],
    spacing: { before: 280, after: 140 },
  });
}

function H3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [
      new TextRun({ text, bold: true, size: 24, color: "4B5563", font: "Arial" }),
    ],
    spacing: { before: 200, after: 100 },
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    children: makeRuns(text),
    spacing: { after: 60 },
  });
}

function numbered(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "numbers", level },
    children: makeRuns(text),
    spacing: { after: 60 },
  });
}

// Quick text-with-inline-bold parser: **bold** segments become bold runs.
function makeRuns(text) {
  if (typeof text !== "string") return text;
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      return new TextRun({ text: p.slice(2, -2), bold: true, font: "Arial" });
    }
    if (p.startsWith("`") && p.endsWith("`")) {
      return new TextRun({
        text: p.slice(1, -1),
        font: "Consolas",
        size: 20,
        shading: { type: ShadingType.CLEAR, fill: "F3F4F6" },
      });
    }
    return new TextRun({ text: p, font: "Arial" });
  });
}

// Build a table with equal columns, header row shaded, given a 2D array of strings.
function buildTable(rows, colWidthsRaw) {
  const colCount = rows[0].length;
  const colWidths =
    colWidthsRaw && colWidthsRaw.length === colCount
      ? colWidthsRaw
      : Array(colCount).fill(Math.floor(CONTENT_WIDTH / colCount));
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: rows.map(
      (row, ri) =>
        new TableRow({
          children: row.map(
            (cell, ci) =>
              new TableCell({
                borders: BORDERS,
                width: { size: colWidths[ci], type: WidthType.DXA },
                shading:
                  ri === 0
                    ? { type: ShadingType.CLEAR, fill: "DCEAFA" }
                    : undefined,
                margins: { top: 80, bottom: 80, left: 120, right: 120 },
                children: [
                  new Paragraph({
                    children: makeRuns(cell),
                    spacing: { after: 0 },
                    alignment: ci > 0 && ri > 0
                      ? AlignmentType.LEFT
                      : AlignmentType.LEFT,
                  }),
                ],
              })
          ),
        })
    ),
  });
}

const blank = () => new Paragraph({ children: [new TextRun({ text: "" })] });

// ───── Document body ─────────────────────────────────────────────
const body = [];

body.push(H1("Merging Quikfinance into Quikit"));
body.push(P("Design options and recommended phased rollout."));
body.push(blank());

body.push(
  P([
    new TextRun({ text: "Status: ", bold: true, font: "Arial" }),
    new TextRun({ text: "Draft / discussion. No code changes yet.", font: "Arial" }),
  ])
);
body.push(
  P([
    new TextRun({ text: "Author: ", bold: true, font: "Arial" }),
    new TextRun({ text: "Claude + Rishabh", font: "Arial" }),
  ])
);
body.push(
  P([
    new TextRun({ text: "Date: ", bold: true, font: "Arial" }),
    new TextRun({ text: "2026-05-12", font: "Arial" }),
  ])
);
body.push(
  P([
    new TextRun({ text: "Target: ", bold: true, font: "Arial" }),
    new TextRun({
      text:
        "Surface Quikfinance as an app inside the Quikit platform at https://quik-it-auth.vercel.app/apps.",
      font: "Arial",
    }),
  ])
);

// ───── TL;DR ─────
body.push(H2("TL;DR"));
body.push(
  P(
    "There are four realistic ways to merge Quikfinance into Quikit. They differ wildly in scope, time, and what end-users actually experience:"
  )
);
body.push(blank());
body.push(
  buildTable(
    [
      ["Option", "What user sees", "Engineering effort", "Recommended?"],
      [
        "A. SSO redirect",
        "Click \"Quikfinance\" in Quikit's /apps → hops to quikfinance.vercel.app with their identity pre-established. Two domains, two URL bars.",
        "1–2 weeks",
        "✅ Start here",
      ],
      [
        "B. Iframe embed",
        "Quikfinance renders inside Quikit's chrome at quikit.com/apps/quikfinance. Looks unified, one URL.",
        "2–3 weeks",
        "🟡 Only if unified UI is non-negotiable",
      ],
      [
        "C. Reverse-proxy mount",
        "Quikit fronts Quikfinance at quikit.com/apps/quikfinance/* via Vercel rewrites. Same-origin cookies.",
        "2–4 weeks",
        "🟡 More complex than it looks (asset URLs, cookies)",
      ],
      [
        "D. Full code merge",
        "One monorepo, one Vercel project, one DB.",
        "2–3 months",
        "❌ Too heavy unless you're consolidating products",
      ],
    ],
    [1600, 3360, 1800, 2600]
  )
);
body.push(blank());
body.push(
  P([
    new TextRun({ text: "Recommendation: ", bold: true, font: "Arial" }),
    new TextRun({
      text:
        "Ship Option A (SSO redirect) as Phase 1. It unblocks the user-visible win — Quikfinance appears as a tile in Quikit's app launcher — without committing to deep integration. Phase 2 can layer Option B or C on top later.",
      font: "Arial",
    }),
  ])
);

// ───── What I learned about Quikit ─────
body.push(H2("What I learned about Quikit"));
body.push(P("From probing the public surface (without logging in, since you asked me to stop):"));
body.push(bullet("Two Vercel apps, not one:"));
body.push(bullet("auth-quikit.vercel.app — identity provider (login page, brand \"QuikIT\")", 1));
body.push(bullet("quik-it-auth.vercel.app — application shell (redirects unauthenticated users to the auth app)", 1));
body.push(bullet("Strict frame headers on the shell: X-Frame-Options SAMEORIGIN, CSP frame-ancestors 'none'. Quikit refuses to be embedded in other apps — good security hygiene; any integration we propose has to clear the same bar."));
body.push(bullet("/apps is the launcher route — auth-gated. Based on URL pattern, almost certainly a tile-grid of apps similar to Microsoft 365's launcher or Zoho One's home."));
body.push(bullet("Stack uses Sentry for observability, lives entirely on Vercel."));
body.push(blank());
body.push(
  P([
    new TextRun({ text: "Assumption I'm making: ", bold: true, font: "Arial" }),
    new TextRun({
      text:
        "you own both Quikit and Quikfinance (you handed me admin credentials for both, and asked to \"merge\" them). If Quikit is actually a third-party platform you don't control, ignore Section \"Quikit-side changes\" below — you'd need to follow whatever public integration API Quikit publishes.",
      font: "Arial",
    }),
  ])
);

// ───── Option A ─────
body.push(H2("Option A — SSO Redirect (recommended Phase 1)"));
body.push(H3("What it looks like"));
body.push(numbered("User logs into Quikit at auth-quikit.vercel.app"));
body.push(numbered("Lands on Quikit's /apps page"));
body.push(numbered("Clicks the Quikfinance tile"));
body.push(numbered("Quikit generates a short-lived signed JWT carrying { sub, email, name, tenantId, exp }"));
body.push(numbered("Browser is redirected to https://quikfinance-software.vercel.app/api/auth/sso?token=<jwt>"));
body.push(numbered("Quikfinance verifies the JWT (HS256 with shared secret or RS256 with public key), upserts the user + organization, sets a NextAuth session cookie, redirects to /"));
body.push(numbered("User lands on Quikfinance dashboard, authenticated"));

body.push(H3("Why this is the right Phase 1"));
body.push(bullet("No iframe gymnastics. Quikfinance keeps its current domain, URL bar, cookie path."));
body.push(bullet("No reverse proxy needed. Vercel routes stay flat."));
body.push(bullet("Reversible. If you decide to roll back, you delete one route + remove the tile. No code-merge debt."));
body.push(bullet("Each app keeps its own deploy / release cadence. Quikfinance's CI doesn't entangle with Quikit's."));
body.push(bullet("Auth model already exists in Quikfinance — adding an SSO entry point is one new route handler + one NextAuth provider."));

body.push(H3("Quikfinance-side changes"));
body.push(
  buildTable(
    [
      ["File", "Change", "Lines"],
      ["app/api/auth/sso/route.ts", "NEW — GET handler that verifies JWT, creates/looks up user + org via Prisma, calls NextAuth signIn with sso=true, redirects to /. Bound to env-defined Quikit issuer.", "~80"],
      ["lib/auth.ts", "Add a second Credentials provider with id 'quikit-sso' that trusts a pre-verified user payload. Existing email/password provider stays.", "+30"],
      ["lib/quikit-sso.ts", "NEW — JWT verification + user-provisioning helper. Uses jose or @panva/jose.", "~120"],
      [".env.example", "Add QUIKIT_SSO_ISSUER, QUIKIT_SSO_AUDIENCE, QUIKIT_SSO_SECRET (HS256) or QUIKIT_SSO_JWKS_URL (RS256).", "+4"],
      ["prisma/schema.prisma", "Add User.quikitId String? @unique and Organization.quikitTenantId String? @unique. New migration.", "+2"],
      ["middleware.ts", "Allow-list /api/auth/sso in PUBLIC_PATHS so JWT verifies before middleware redirect to /login.", "+1"],
      ["app/(auth)/login/form.tsx", "(Optional) Add \"Sign in with Quikit\" button linking back to the Quikit launcher.", "+15"],
      ["tests/unit/sso.test.ts", "NEW — JWT verification, expired-token rejection, signature-mismatch, user-upsert idempotency.", "~80"],
      ["tests/e2e/quikit-sso.spec.ts", "NEW — Playwright mints test JWT with dev secret, GETs /api/auth/sso?token=..., asserts session cookie + dashboard renders.", "~100"],
      ["DECISIONS.md", "D77 — SSO from Quikit via signed JWT (HS256), users provisioned on first hit.", "+10"],
      ["README.md", "New section \"Quikit SSO\" with env-var setup + how to issue test tokens locally.", "+25"],
    ],
    [2400, 5760, 1200]
  )
);
body.push(blank());
body.push(
  P([
    new TextRun({
      text: "Total: ~470 LOC of new code, ~50 LOC modified.",
      bold: true,
      font: "Arial",
    }),
  ])
);

body.push(H3("Quikit-side changes (assuming you own Quikit)"));
body.push(
  buildTable(
    [
      ["File", "Change"],
      ["apps/[tile-grid]/page.tsx", "Add new app tile: { id: 'quikfinance', name: 'Quikfinance', icon: '/icons/quikfinance.svg', launchUrl: '/api/launch/quikfinance' }."],
      ["app/api/launch/quikfinance/route.ts", "NEW — issues short-lived JWT (5-min exp) with current user identity, redirects to Quikfinance SSO endpoint."],
      ["lib/sso-tokens.ts", "Per-app key registry: { quikfinance: { secret: process.env.QUIKFINANCE_SSO_SECRET, audience: 'quikfinance' } }."],
      ["Env vars", "QUIKFINANCE_SSO_SECRET (matches Quikfinance side). Generate via openssl rand -hex 32."],
    ],
    [2800, 6560]
  )
);
body.push(blank());
body.push(
  P(
    "If Quikit already has an internal launch-token pattern for other apps, follow that — the spec above is what a clean implementation looks like, not necessarily what fits the existing code."
  )
);

body.push(H3("Security checklist (Phase 1)"));
body.push(bullet("JWT max lifetime 5 minutes — too short to replay, long enough for slow networks"));
body.push(bullet("Audience claim (aud: 'quikfinance') enforced — token for one app can't unlock another"));
body.push(bullet("One-time-use jti tracked in Quikfinance for ~10 min — defeats replay within the 5-min window"));
body.push(bullet("Shared secret stored as encrypted env var on Vercel (both sides)"));
body.push(bullet("HTTPS-only redirects (already enforced by HSTS)"));
body.push(bullet("Quikfinance audit log writes an SsoSignIn event with quikitTenantId + userId per successful exchange"));
body.push(bullet("No JWT logged anywhere (Sentry breadcrumb filter)"));

body.push(H3("Effort estimate"));
body.push(bullet("Design + Quikit-side launch endpoint: 2 days"));
body.push(bullet("Quikfinance /api/auth/sso route + JWT verifier + user provisioning: 3 days"));
body.push(bullet("Tests (unit + Playwright): 2 days"));
body.push(bullet("Docs + DECISIONS update: 0.5 days"));
body.push(bullet("End-to-end manual smoke + bug fixes: 1.5 days"));
body.push(
  P([
    new TextRun({
      text: "Total: ~9 working days (~2 weeks calendar).",
      bold: true,
      font: "Arial",
    }),
  ])
);

// ───── Option B ─────
body.push(H2("Option B — Iframe Embed (Phase 2, optional)"));
body.push(H3("What it looks like"));
body.push(
  P(
    "Same as Option A plus: Quikit's /apps/quikfinance route renders a full-page iframe pointing at quikfinance-software.vercel.app/?embedded=true. User stays on the Quikit domain in their URL bar."
  )
);

body.push(H3("Why not yet"));
body.push(bullet("Cross-domain cookies need SameSite=None; Secure — works on every modern browser but is more fragile than top-level navigation."));
body.push(bullet("Quikfinance's sidebar is duplicated visual chrome — Quikit's chrome + Quikfinance's sidebar. Hide one in ?embedded=true mode or live with doubled UI."));
body.push(bullet("Modals + popovers (Radix UI) sometimes break when the page is in an iframe with clip-path ancestors. Fixable but adds polish cycles."));
body.push(bullet("PDF download links + email send routes need to work in cross-frame contexts."));
body.push(
  P([
    new TextRun({ text: "Effort: ", bold: true, font: "Arial" }),
    new TextRun({
      text:
        "+1 week on top of Option A. The two are additive — you don't have to pick.",
      font: "Arial",
    }),
  ])
);

body.push(H3("Files that would change beyond Option A"));
body.push(bullet("app/(dashboard)/layout.tsx — conditional searchParams.embedded === 'true' branch that hides Sidebar + TopHeader + RightRail."));
body.push(bullet("next.config.mjs — relax X-Frame-Options to allow framing by https://quik-it-auth.vercel.app specifically."));
body.push(bullet("app/(dashboard)/page.tsx (and all dashboard pages indirectly) — ensure cookies use SameSite=None."));
body.push(bullet("middleware.ts — allow the ?embedded query param to pass through without redirect chains."));

// ───── Option C ─────
body.push(H2("Option C — Reverse-Proxy Mount (alternate Phase 2)"));
body.push(H3("What it looks like"));
body.push(
  P(
    "Quikit's Vercel config rewrites quikit.com/apps/quikfinance/* → quikfinance-software.vercel.app/*. Same-origin from the browser's perspective — cookies set on quikit.com flow naturally."
  )
);

body.push(H3("Why this is harder than it sounds"));
body.push(bullet("Every asset URL (CSS, fonts, _next/static/*, Razorpay iframe, AI streaming endpoint) needs the proxy path prefix or absolute URLs. Next.js's basePath is a build-time decision — two deploy targets."));
body.push(bullet("OAuth callbacks (Google sign-in, Razorpay webhook) need stable URLs — can't bounce through a proxy."));
body.push(bullet("Cron jobs (/api/cron/recurring-bills etc.) need to hit the underlying Quikfinance URL directly, not the proxy."));
body.push(
  P([
    new TextRun({
      text:
        "Pick this only if the unified URL is critical AND iframe doesn't satisfy the UX requirement. Estimate: 3–4 weeks including the asset-URL refactor.",
      font: "Arial",
    }),
  ])
);

// ───── Option D ─────
body.push(H2("Option D — Full Code Merge (probably wrong)"));
body.push(
  P(
    "Lift app/(dashboard)/**, lib/**, prisma/schema.prisma from Quikfinance into Quikit's monorepo. Share the auth + DB. Single Vercel deploy."
  )
);

body.push(H3("Reasons to do this"));
body.push(P("You want one product, not two. Marketing, billing, support all unified."));

body.push(H3("Reasons not to do this"));
body.push(bullet("Quikfinance has its own Prisma schema (~50 tables, 14 migrations) — merging with Quikit's schema is a careful migration on production data."));
body.push(bullet("Different release cadences become impossible — every Quikit deploy redeploys all of Quikfinance's complexity."));
body.push(bullet("Rollback is no longer \"remove a tile\" — it's a database migration in reverse."));
body.push(bullet("Test surface area triples."));
body.push(
  P([
    new TextRun({ text: "Estimate: ", bold: true, font: "Arial" }),
    new TextRun({
      text:
        "2–3 months. Don't pick this unless you've already decided Quikfinance is a feature of Quikit, not a separate product.",
      font: "Arial",
    }),
  ])
);

// ───── Phased plan ─────
body.push(H2("Phased plan (recommended)"));
body.push(
  buildTable(
    [
      ["Phase", "Scope", "Outcome"],
      ["Phase 1 (week 1–2)", "Option A — SSO redirect", "Quikfinance tile in Quikit /apps clicks through to the live app, user is signed in. Two URLs, one identity."],
      ["Phase 2a (week 3–4, optional)", "Layer Option B (iframe) on top", "Quikfinance renders inside Quikit's chrome at quikit.com/apps/quikfinance. One URL bar."],
      ["Phase 2b (week 5+, alternative)", "Option C — reverse proxy", "Same single-URL feel, achieved via Vercel rewrites. Bigger lift; only if iframe UX is rejected."],
      ["Phase 3 (future)", "Data integration", "Quikit user directory ↔ Quikfinance Contact table; Quikit billing ↔ Quikfinance subscription state; single audit-log feed."],
    ],
    [2000, 2800, 4560]
  )
);

// ───── Open questions ─────
body.push(H2("Open questions (need your call before Phase 1 starts)"));
body.push(numbered("Who owns Quikit? If it's a third-party platform, do they publish a developer API? Send me the docs link."));
body.push(numbered("Does Quikit already have an SSO pattern for other apps? If yes, we follow it instead of inventing. (What do other apps in /apps use?)"));
body.push(numbered("One Quikfinance tenant per Quikit tenant, or many? Affects whether Organization.quikitTenantId is unique or not."));
body.push(numbered("What happens on sign-out? Quikfinance sign-out kills only the Quikfinance session, or propagates back to Quikit? Standard: kill only Quikfinance."));
body.push(numbered("Provisioning flow for net-new users. Does a Quikit user clicking the tile automatically get a Quikfinance org with a starter chart-of-accounts (same as the signup flow), or does the Quikit admin pre-provision?"));

// ───── Risks ─────
body.push(H2("Risks + rollback"));
body.push(
  buildTable(
    [
      ["Risk", "Mitigation"],
      ["Shared SSO secret leaks", "Rotate via env-var update + redeploy; 5-min token TTL means damage window is tiny."],
      ["Quikit's auth changes break Quikfinance SSO", "Add Sentry alert on SSO endpoint 4xx/5xx rate; Quikit-side regression tests."],
      ["User upserts create duplicate orgs", "Organization.quikitTenantId @unique enforces this at the DB level."],
      ["Quikfinance breaks an app feature (Razorpay, etc.) due to embedded-mode quirks", "Phase 1 (Option A) avoids this entirely — Quikfinance stays standalone."],
    ],
    [3600, 5760]
  )
);
body.push(blank());
body.push(
  P([
    new TextRun({ text: "Rollback for Phase 1: ", bold: true, font: "Arial" }),
    new TextRun({
      text:
        "Remove the Quikfinance tile from Quikit's /apps. Direct users back to quikfinance-software.vercel.app/login. No code revert needed on the Quikfinance side beyond optionally disabling the SSO route via an env-var feature flag.",
      font: "Arial",
    }),
  ])
);

// ───── What I need ─────
body.push(H2("What I need from you to start Phase 1"));
body.push(numbered("Decision on Option A vs B (or \"do both, A first\")."));
body.push(numbered("Confirmation you own both apps (or pointer to Quikit's dev docs if not)."));
body.push(numbered("Where Quikit's apps registry lives in their codebase — file path or repo URL. I'll mirror their existing app-tile format."));
body.push(numbered("Shared secret strategy: HS256 (simpler) vs RS256 (Quikit publishes a JWKS URL, more standard). Default recommendation: HS256 for Phase 1, migrate to RS256 if you add more apps later."));
body.push(blank());
body.push(
  P([
    new TextRun({
      text: "Once those four are answered, Phase 1 is a clean 2-week PR.",
      bold: true,
      font: "Arial",
      italics: true,
    }),
  ])
);

// ───── Build document ─────
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: "1F2937" },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0 },
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: "374151" },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 },
      },
      {
        id: "Heading3",
        name: "Heading 3",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "4B5563" },
        paragraph: { spacing: { before: 200, after: 100 }, outlineLevel: 2 },
      },
    ],
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
          {
            level: 1,
            format: LevelFormat.BULLET,
            text: "◦",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
          },
        ],
      },
      {
        reference: "numbers",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          },
        ],
      },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: "Quikfinance × Quikit · Integration Design",
                  font: "Arial",
                  size: 18,
                  color: "9CA3AF",
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: "Page ", font: "Arial", size: 18, color: "9CA3AF" }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  font: "Arial",
                  size: 18,
                  color: "9CA3AF",
                }),
                new TextRun({ text: " of ", font: "Arial", size: 18, color: "9CA3AF" }),
                new TextRun({
                  children: [PageNumber.TOTAL_PAGES],
                  font: "Arial",
                  size: 18,
                  color: "9CA3AF",
                }),
              ],
            }),
          ],
        }),
      },
      children: body,
    },
  ],
});

const outPath = path.join(__dirname, "quikit-integration.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log(`wrote ${outPath} (${buf.length} bytes)`);
});
