# Quikfinance

Production-grade accounting SaaS — Next.js 14 (App Router) + Prisma + PostgreSQL + NextAuth v5 + Tailwind + shadcn/ui + Anthropic AI.

This is the build referenced in `Quikfinance_Master_Prompt.docx`. It follows the exact phased plan in `<delivery_plan>` from that prompt.

## Build status

| Phase | Status |
|-------|--------|
| 1. Foundation (schema, auth, app shell, dashboard) | **complete (this commit)** |
| 2. Items module (reference implementation) — list, sort, filter, search, paginate, bulk, export | **list page complete; new/edit/import wizard pending** |
| 3. Settings + AI Assistant + Quick Create + Refer & Earn | AI Assistant + Quick Create + Refer & Earn complete; Settings grid + sub-page contents pending |
| 4. Remaining modules (CRUD scaffolds) | route stubs in place; CRUD pending |
| 5. Polish (loading skeletons, dark mode, Playwright, Lighthouse) | pending |

## Setup (one-time)

### 1. Install dependencies

```bash
pnpm install
```

If you don't have pnpm: `npm install -g pnpm`.

### 2. Provision a PostgreSQL database

Any of the following works:
- **Vercel Postgres** — create from the Vercel dashboard, copy the `DATABASE_URL`
- **Neon** — `neon.tech`, free tier
- **Supabase** — `supabase.com`, free tier (use the connection string under Project Settings → Database)
- **Local** — `docker run --name qf-postgres -e POSTGRES_PASSWORD=quik -p 5432:5432 -d postgres:16` then `DATABASE_URL=postgresql://postgres:quik@localhost:5432/quikfinance`

### 3. Configure environment

```bash
cp .env.example .env.local
# fill in DATABASE_URL, AUTH_SECRET (openssl rand -base64 32), and any optional providers
```

### 4. Migrate and seed

```bash
pnpm prisma:migrate    # applies schema, prompts for migration name (use "init")
pnpm db:seed           # creates demo org + admin@quikfinance.dev / Quikfinance!123
```

### 5. Run

```bash
pnpm dev
```

Open `http://localhost:3000`. Sign in with the seeded credentials, or create a new account from `/signup`.

## What you can do today

- **Sign up / log in / Google OAuth** — full credentials flow with email verification + password reset
- **Multi-tenant orgs** — switch between orgs in the header, create new ones via the org switcher
- **Dashboard** — real receivables/payables, KPIs, recent activity reading from the DB
- **Items** — list with server-side sort, filter (Active/Inactive), debounced search, pagination (25/50/100), bulk activate/deactivate/delete with audit log, three-dots menu (sort, import stub, export real CSV/XLSX, preferences, refresh, reset cols), URL state preserved via `nuqs`
- **AI Assistant** — bottom-right chat that streams from Claude (set `ANTHROPIC_API_KEY`)
- **Quick Create + Refer & Earn + Notifications + Profile popover + Org switcher + Command palette (`/`)** — all wired in the header
- **Settings grid** — every section per `<settings_spec>` is present with the correct route

## What's stubbed (Phase 2–4 work)

- `/items/new` and `/items/import` — schema, server action, validation, and sample template are ready; only the form/wizard UI is pending
- Settings sub-pages — routes will 404 until each is filled in
- Sales / Purchases / Banking / Time / Accountant / Reports / Documents / Payroll / Payments — landing pages render `ModuleStub`; full CRUD comes in Phase 4
- Playwright E2E test
- Loading skeletons on every page

## Architecture

- **App Router**: `app/(auth)` for unauthenticated pages, `app/(dashboard)` for authenticated. Middleware redirects unauthenticated requests to `/login`.
- **Auth**: NextAuth v5 with Prisma adapter, JWT sessions, credentials + Google providers.
- **Multi-tenancy**: every business model has `organizationId`. The active org is stored in a cookie (`qf_active_org`) and resolved via `requireOrganization()` in `lib/auth-helpers.ts`. All queries filter by it.
- **Audit log**: every mutation (server action) writes to `AuditLog` via `writeAuditLog()`.
- **Money**: `Decimal(18,4)` everywhere; UI formats via `Intl.NumberFormat` in `lib/money.ts`.
- **Soft delete**: `deletedAt` on Item, Invoice, Bill, Contact. Hard delete only for drafts.

## Deploy to Vercel

1. Push to GitHub.
2. Import on Vercel.
3. Add a Vercel Postgres or external Postgres, copy `DATABASE_URL` and `DIRECT_URL` to env.
4. Add `AUTH_SECRET` (`openssl rand -base64 32`), `NEXTAUTH_URL=https://your-domain`, optionally `AUTH_GOOGLE_ID/SECRET`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`.
5. Build command: `pnpm build`. Install: `pnpm install`.
6. After first deploy, run `pnpm prisma:deploy && pnpm db:seed` from your local machine pointed at production DB (or use `vercel env pull` + a one-off script).

## Scripts

| Command | Effect |
|---------|--------|
| `pnpm dev` | start dev server |
| `pnpm build` | `prisma generate && next build` |
| `pnpm prisma:migrate` | create + apply migrations in dev |
| `pnpm prisma:deploy` | apply pending migrations in prod |
| `pnpm db:seed` | seed demo org + admin user + chart of accounts |
| `pnpm prisma:studio` | open Prisma Studio at localhost:5555 |
| `pnpm type-check` | strict TS pass without emitting |
| `pnpm lint` | Next-flavored ESLint |

## Continuing the build

The master prompt is in `_archive_supabase_v1/` (along with the previous Supabase scaffold this replaced). Each subsequent turn extends one phase at a time without rewriting earlier phases.

## Sales module

Built per `quikfinance_sales_master_prompt.md`. Eight phases shipped on the `feat/sales-module` branch (S1–S8).

### Sub-modules
| Sub-module | List | Form | Detail | Lifecycle | Conversions |
|-----------|------|------|--------|-----------|-------------|
| Customers (`/sales/customers`) | empty state + table | 6-tab New/Edit | 5-tab detail with receivables, transactions timeline | Active/Inactive, soft-delete | — |
| Quotes (`/sales/quotes`) | + lifecycle SVG | full form, line items, totals | status pill + status-aware actions | DRAFT→SENT→ACCEPTED/DECLINED→INVOICED/EXPIRED | → Invoice, → Sales Order |
| Sales Orders (`/sales/orders`) | + lifecycle SVG | shipment date, payment terms, delivery method | status-aware actions | DRAFT→CONFIRMED→CLOSED, VOID | → Invoice, → Purchase Order (stub) |
| Invoices (`/sales/invoices`) | populated table | shared form, payment-terms-driven due date | balance card + Record Payment / Send Reminder / Void / Write Off / Apply Credits | DRAFT→SENT→PARTIALLY_PAID→PAID, OVERDUE/VOID/WRITTEN_OFF | (target of conversion) |
| Recurring Invoices (`/sales/recurring-invoices`) | next-occurrence date | frequency + intervalN, neverExpires | Pause/Resume/Stop/Run Now + generated invoices timeline | ACTIVE/PAUSED/STOPPED/EXPIRED | generates Invoice |
| Delivery Challans (`/sales/delivery-challans`) | challan type column | challan type radio | Mark Delivered/Returned | DRAFT/OPEN/DELIVERED/INVOICED/RETURNED | — |
| Payments Received (`/sales/payments-received`) | applied invoices column | customer-driven open-invoices loader, auto-allocate-oldest | allocations + bank charges + customer credit | (no lifecycle) | — |
| Credit Notes (`/sales/credit-notes`) | balance column | reason picker | Apply-to-Invoice modal + Refund modal | OPEN/CLOSED/VOID | applies to Invoice |

### Shared primitives
- `<TransactionListPage>` — empty state, three-dots menu, sort options, paginated DataTable wrapper
- `<TransactionLineItemsTable>` — line-items grid with reactive sub-total/discount/tax/adjustment/total computation; `lib/sales/totals.ts` is the single source of math (server + client share it)
- `<MoneyInput>`, `<DatePicker>`, typed Combobox wrappers (`ContactCombobox`, `ItemCombobox`, `TaxSelect`, `SalespersonCombobox`, `ProjectCombobox`, `TermsCombobox`, `DeliveryMethodCombobox`)
- `<RecordPaymentDialog>` for inline payment recording from invoices

### Server utilities (`lib/sales/`)
- `numbering.ts` — `getNextDocumentNumber(orgId, "QUOTE" | "INVOICE" | …)` atomic increment via `NumberSeries`
- `totals.ts` — Decimal-safe document compute (lines + sub-total + discount + tax + adjustment + grand total)
- `email-sender.ts` — `enqueueEmail()` writes EmailJob, `processEmailJob()` is idempotent, cron drains every 15 min
- `pdf-renderer.ts` — HTML-fallback renderer (S3 swap to `@react-pdf/renderer` is the next iteration)
- `cron.ts` — `assertCronAuthorized()` guard for cron routes
- `recurring.ts` — `computeNextOccurrence()` + `generateRecurringOccurrence()` (idempotent on `(recurringInvoiceId × occurrenceDate)`)

### Cron setup
`vercel.json` schedules:
- `/api/cron/recurring-invoices` daily at 02:00 UTC — generates invoices for due recurring profiles
- `/api/cron/invoice-statuses` daily at 02:30 UTC — flips Sent invoices to Overdue when past due
- `/api/cron/email-job-retry` every 15 min — drains pending EmailJobs

Local triggering: `curl 'http://localhost:3000/api/cron/email-job-retry'` (no auth in dev when `CRON_SECRET` is unset). Production: configure `CRON_SECRET` env and Vercel sends it via `x-vercel-cron-secret` header.

### Resend setup
Set `RESEND_API_KEY` and `EMAIL_FROM` env vars to enable real email delivery. Without them, `sendEmail()` falls back to console-logging in dev — the EmailJob row still records, so the queue is observable.

### GST stub
The schema captures `gstin`, `gstTreatment`, `placeOfSupply`, `pan`, `taxPreference`, and HSN/SAC line-item fields. The "Prefill from GSTIN" UI flow per the spec stubs to a mock response — production wiring requires a real GST portal API key (`/api/gst/lookup` placeholder).

### Feature flags
- `gst.advanced` (Phase S6+) — gates GST split (CGST+SGST vs IGST), e-invoice JSON, place-of-supply autoswitch
- `pdf.reactRenderer` (Phase S3 follow-up) — flips `lib/sales/pdf-renderer.ts` from HTML to `@react-pdf/renderer`
- `purchases.bharatConnect` (Phase S4 stub) — Convert SO → Purchase Order writes a placeholder PO row when Purchases module is fuller
