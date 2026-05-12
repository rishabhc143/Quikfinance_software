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
| **Purchases — Bills** | Complete — list, full multi-line form with manual numbering + soft duplicate warning, billable-to-customer per line, fromPO seeding, detail page (payments/credits applied + MSME-aware overdue banner + Draft→Open→Void/Write-off transitions), Apply Credits dialog, Convert to Recurring, **PDF route**, **CSV import** |
| **Purchases — Payments Made** | Complete — list, **two-tab form (Bill Payment | Vendor Advance)** with allocation table, vendor-advance drawdown, excess-to-advance auto-spawn |
| **Purchases — Vendor Credits** | Complete — list, full multi-line form (`CN-` prefix), detail page with **Apply-to-Bill** + **Record Refund** dialogs, **PDF route**, **CSV import** |
| **Purchases — Recurring Bills / Expenses** | Complete — full multi-line forms, detail pages with Pause/Resume/Stop/Run-Now/Edit, daily crons (`/api/cron/recurring-bills`, `/api/cron/recurring-expenses`) generating DRAFT Bills + Expense rows, **CSV import wizards** |
| **Purchases — Expenses** | Placeholder per spec — list parity-complete + deferred-feature banner on form; Mileage / OCR / Convert-to-Bill ship in refinement patch |
| **Purchases — Billable expenses integration** | Complete — Bill lines + Expenses marked `billableToCustomerId` surface on customer's next Invoice via `<BillableExpensesPanel>`; save action marks source rows used |
| **Purchases — Partner-bank integration** | Stub page at `/settings/integrations/bill-pay-banks` with 3 banks (ICICI/HDFC/Axis), "Notify me" opt-in. Full API integration deferred — separate procurement workstream |
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
2. Add `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `NEXTAUTH_URL`. Optional: `AUTH_GOOGLE_ID/SECRET`, `RESEND_API_KEY`, `MIGRATION_KEY`.
3. Set **`QUIK_AUTO_MIGRATE=1`** so every cold start applies pending Prisma migrations (the build script can't because Vercel marks DB env vars as Sensitive).

The hook lives in [`instrumentation.ts`](instrumentation.ts) and calls [`lib/admin/run-migrations.ts`](lib/admin/run-migrations.ts), which is also exposed manually at `POST /api/admin/migrate` (auth-gated by `MIGRATION_KEY`).

### AI Assistant ("Need Assistance?" button)

The floating Claude-powered assistant at the bottom-right of every dashboard page needs an Anthropic API key to answer questions.

1. Grab a key from <https://console.anthropic.com> → **Settings** → **API Keys** → **Create Key**. You'll also need to add a payment method — Anthropic charges per token (Sonnet 4.5 is roughly $3 per million input tokens, $15 per million output as of 2026; typical chat exchanges cost fractions of a cent).
2. On Vercel: **Project Settings** → **Environment Variables** → add `ANTHROPIC_API_KEY` = `sk-ant-...` for the Production target.
3. Trigger a redeploy (Deployments → ⋯ → Redeploy on the latest commit) so the running serverless functions pick up the new value.

Without the key, the button still renders but the chat returns a friendly "AI assistant is temporarily unavailable" message. The model used is `claude-sonnet-4-5` (a stable alias) — change it in [`app/api/ai/chat/route.ts`](app/api/ai/chat/route.ts) if you want to swap to Haiku or Opus.

Org admins can override the default system prompt + daily rate limit at `/settings/ai`. Default limit is 50 messages/user/day.

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
