# Quikfinance

Production-grade accounting SaaS — Next.js 14 (App Router) + Prisma + PostgreSQL + NextAuth v5 + Tailwind + shadcn/ui + Anthropic AI.

**Production:** https://quikfinance-software.vercel.app

## Build status

| Module | State |
|---|---|
| **Auth / org / shell / dashboard** | Complete — credentials + Google, multi-tenant, command palette, collapsible sidebar |
| **Items** | Complete — list / new / edit / import wizard / inventory adjustments + a **stock-levels page** (`/items/stock`) with reorder alerts + per-item adjustment history |
| **Sales** | Complete — see [`app/(dashboard)/sales/README.md`](app/(dashboard)/sales/README.md) for the 8 sub-modules (Customers / Quotes / Sales Orders / Invoices / Recurring / Delivery Challans / Payments Received / Credit Notes), plus Debit Notes |
| **Inventory mutation ledger** | Complete — invoice decrements, credit-note returns, DC ship/return, SO reservations; `available = on-hand − reserved` |
| **Reports** | Complete — P&L, Balance Sheet, Cash Flow, Sales Summary, Tax Summary, AR Aging, AP Aging, **GSTR-1 export**, **Stock Valuation** |
| **Settings** | Complete — Organization Profile (with GSTIN), General, Branding, Numbering, Taxes, PDF Templates, Online Payments (Razorpay), Direct Taxes (TDS), Custom Domain, Preferences per module, etc. |
| **Customer portal** | Public invoice page + Razorpay Pay Now + payment-history page (per-customer receipts) |
| **Purchases — Vendors** | Complete — list page with MSME banner + bulk actions, full 7-tab form, import wizard, 3-option export (vendors / contact persons / addresses) |
| **Purchases — Purchase Orders** | Complete — list with saved views + bulk close/cancel/delete, full multi-line form with inline ACCOUNT column + place-of-supply + TDS/TCS, detail page with status transitions (Mark Issued / Convert to Bill / Cancel / Close / Clone), PDF render, email send via queue |
| **Purchases — Bills / Payments Made / Vendor Credits / Recurring / Expenses** | Schema landed (PR #81); UI scaffold only |
| **Banking / Accountant / Time / Documents / Payroll / Payments** | Schema + landing pages; CRUD UI is sparse |
| **AI Assistant** | Streaming Claude chat in the bottom-right rail |

## Setup (one-time)

```bash
pnpm install
cp .env.example .env.local           # fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET
pnpm prisma:migrate                   # apply schema; name first migration "init"
pnpm db:seed                          # demo org + admin@quikfinance.dev / Quikfinance!123
pnpm dev                              # http://localhost:3000
```

Postgres: Neon, Supabase, or local Docker (`docker run --name qf-postgres -e POSTGRES_PASSWORD=quik -p 5432:5432 -d postgres:16`).

## Deploy

1. Push to GitHub → import on Vercel.
2. Add `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`. Optional: `AUTH_GOOGLE_ID/SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `MIGRATION_KEY`.
3. Set **`QUIK_AUTO_MIGRATE=1`** so every cold start applies pending Prisma migrations (the build script can't because Vercel marks DB env vars as Sensitive).

The hook lives in [`instrumentation.ts`](instrumentation.ts) and calls [`lib/admin/run-migrations.ts`](lib/admin/run-migrations.ts), which is also exposed manually at `POST /api/admin/migrate` (auth-gated by `MIGRATION_KEY`).

## Architecture cheatsheet

- **App Router**: `app/(auth)` for unauthenticated, `app/(dashboard)` for authenticated, `app/portal` for customer-facing.
- **Multi-tenancy**: every business model has `organizationId`. Resolved in `requireOrganization()` (`lib/auth-helpers.ts`). All queries filter by it.
- **Audit log**: every mutation writes to `AuditLog` via `writeAuditLog()`.
- **Money**: `Decimal(18,4)` everywhere; UI formats via `Intl.NumberFormat` in `lib/money.ts`.
- **Soft delete**: `deletedAt` on every business entity. Hard delete only for drafts.
- **Crypto**: AES-256-GCM in `lib/crypto.ts` for at-rest secrets (Razorpay key secret, webhook secret).

## Testing

```bash
pnpm test --run        # vitest unit tests (currently 133)
pnpm test:e2e          # Playwright lifecycle + receivables loop + invoice-create flow
```

CI gates every PR on type-check + lint + vitest + Next.js build + Playwright. No admin-bypass merges (lesson learned the hard way — see PRs #54–#62).

### Test layout
| Suite | Location | Covers |
|---|---|---|
| **Vitest unit** | `tests/unit/` | Money math (line totals, document tax, refund ratios), Razorpay HMAC + refund distribution, GSTR-1 generator, GSTIN validator, stock-level + valuation math, parse-source |
| **Playwright lifecycle** | `tests/e2e/sales-lifecycle.spec.ts` | Every Sales sub-page renders without an error overlay |
| **Playwright receivables** | `tests/e2e/sales-receivables-loop.spec.ts` | Customer → quote → invoice → payment end-to-end |
| **Playwright invoice create** | `tests/e2e/invoice-create.spec.ts` | Full new-invoice form flow with line items |
| **Playwright auth smoke** | `tests/e2e/auth-smoke.spec.ts` | Sign-in + dashboard reach + new-contact form |

## Module deep dives

- **Sales**: [`app/(dashboard)/sales/README.md`](app/(dashboard)/sales/README.md) — saved views, inventory hooks, Razorpay flow, email queue, custom fields
- **Contact import design** (Google / Microsoft, blocked on OAuth registration): [`docs/contact-import-design.md`](docs/contact-import-design.md)

## What's left (high level)

- **Purchases** module to Sales parity (Bills, Vendor Credits, Payments Made, Recurring Bills)
- **SaaS billing & trial enforcement** (`Organization.planTier` exists, no runtime gate)
- **Indian compliance phase 2**: e-invoice IRN, e-way bill, GSTR-3B, GSTR-1 missing sections (B2CL, CDNR, exports, advances)
- **Google / Microsoft contact import** (design doc shipped; OAuth apps not yet registered)
- **Sales Order ↔ Delivery Challan FK** so DCs can auto-consume specific SO reservations

See [`docs/contact-import-design.md`](docs/contact-import-design.md) for one of these in design-doc form.
