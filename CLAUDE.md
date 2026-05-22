# CLAUDE.md — Quikfinance project context

Auto-loaded by Claude Code at session start. Keep this concise; long-form context lives in `README.md`, `DECISIONS.md`, and the per-module READMEs.

---

## TL;DR

**Quikfinance** is a Zoho Books clone for Indian SMBs — Next.js 14 App Router + Prisma + Postgres on Neon, deployed to Vercel. Single canonical prod URL: `https://quikfinance-software.vercel.app`. Single dev/PM (Rishabh) so every PR ships to prod within minutes of merge.

Owner email: `rishabhchourasia143@gmail.com`. Today's date drifts in conversation (mentions of 2026); treat real-world dates as 2025+. Indian Rupees throughout (lakh grouping `₹1,23,456.78`).

## Stack

- **Framework**: Next.js 14 App Router (`/app/(dashboard)/…` for auth-gated pages, `/app/(public)/…` for marketing/help, `/app/api/…` for routes)
- **DB**: Prisma 5.22 → Postgres (Neon). Migrations under `prisma/migrations/<timestamp>_<name>/migration.sql`. Auto-apply on prod cold start when `QUIK_AUTO_MIGRATE=1` is set in Vercel env; manual fallback via `POST /api/admin/migrate` with `x-migration-key: <MIGRATION_KEY>` header.
- **Auth**: NextAuth v5 (credentials + Google), org scoping via `OrganizationMembership`. Every server action / page calls `requireOrganization()` from `lib/auth-helpers`.
- **UI**: shadcn/ui + Tailwind. `cn()` from `lib/utils`. Lucide icons.
- **Storage**: Vercel Blob (`@vercel/blob`, `put()`). Token `BLOB_READ_WRITE_TOKEN` is auto-injected by Vercel — no manual env mgmt.
- **Email**: Resend (`lib/email.ts` wraps it). `EMAIL_FROM` + `RESEND_API_KEY` envs. Falls back to `onboarding@resend.dev` if `EMAIL_FROM` is empty.
- **AI**: Anthropic SDK already a dep (`@anthropic-ai/sdk` v0.30.1). Used by `/app/api/ai/chat/route.ts` (in-app chat assistant) and now by the D4.4 LLM fallback. Model aliases: `claude-sonnet-4-5` / `claude-haiku-4-5`.
- **PDF parsing**: `pdf-parse` (heuristic) + `pdfjs-dist` (password-aware extractor in `lib/documents/pdf-extract.ts`).
- **Tests**: Vitest. Run `pnpm test --run` for one-shot.

## Workflow

1. Branch off `main`. Naming: `feat/<area>-<short-desc>` / `fix/<short-desc>` / `chore/<short-desc>`.
2. Use idempotent migrations (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`). Migration filename = `<UTC-timestamp>_<snake_name>`.
3. Local verify before push: `pnpm prisma generate && pnpm type-check && pnpm lint && pnpm test --run && pnpm build`.
4. Commit, push, `gh pr create`, watch CI: `gh pr checks <num> --watch`.
5. Merge: `gh pr merge <num> --squash --delete-branch` (admin-merge if checks stale).
6. Sync local main: `git checkout main && git pull --ff-only`.
7. Vercel auto-deploys main (~3 min). Verify prod after promotion.

**Never:** force-push to main; skip hooks (`--no-verify`); commit secrets; commit `.env*` files. The repo has gitleaks pre-commit; respect it.

## House conventions

- **Fail-open** is the default for non-critical reads (`safeCount`, try/catch around helpers like `getRecentReportActivity`, parser fallbacks, etc.). The page should always render *something* — never the generic Next.js error screen.
- **No emojis in code** unless explicitly requested.
- **No new docs unless asked** — `README.md` and `DECISIONS.md` are the only project-wide docs we maintain. Per-module READMEs (`app/(dashboard)/<module>/README.md`) live where the module does.
- **Server actions**: `"use server"` at top, `revalidatePath()` after writes, `writeAuditLog()` for material mutations (it's in `lib/audit.ts`).
- **Indian formatting**: dates `dd/MM/yyyy` for inputs but store as `yyyy-MM-dd` ISO. Numbers use `Intl.NumberFormat("en-IN")` for display.

## Repo map (what lives where)

```
app/
  (dashboard)/         Auth-gated pages
    sales/             Customers / Quotes / SOs / Invoices / Credit Notes / Recurring / DC / Payments Received
    purchases/         Vendors / POs / Bills / Payments Made / Vendor Credits / Recurring Bills / Expenses
    banking/           Accounts, transactions, reconciliation
    accountant/        Chart of Accounts, Manual Journals, Budgets, Currency Adjustments
    documents/         Smart Capture (D2.x) + Files inbox + Bank Statements inbox + drawer
    reports/           Reports Center (80 reports) + P&L / BS / CF / Schedule III
    settings/          Profile / GST / Branding / Numbering / Taxes / PDF / Online Payments / etc
    time/              Time Tracking — Projects + Timesheet
  api/                 Webhooks, cron jobs, admin migrate
  help/                Public help articles
  (auth pages root)/   /login /signup /reset-password
components/            shadcn/ui primitives + shared composites
lib/                   Pure helpers — audit, db, auth-helpers, documents/parsers, reports/, sales/, banking/
prisma/                schema.prisma + migrations
tests/unit/            Vitest unit tests, mirrors lib/ structure
```

## Documents module (in active development)

**Smart Capture pipeline** (D1–D4):

1. User uploads PDF → Vercel Blob → Document row
2. `extractPdfTextWithPassword` reads the bytes; returns `{kind: 'ok' | 'needs-password' | 'error'}`
3. `classifyDocument` tags it BANK_STATEMENT / BILL / INVOICE / RECEIPT / CONTRACT
4. `parseByDocumentType` routes to:
   - `parseBankStatement` → 6 per-bank parsers (HDFC/ICICI/Axis/SBI/Kotak/IDFC) → ParsedBankStatement
   - `parseBill` → vendor + GSTIN + total + line items
   - `parseReceipt` → vendor + date + total
5. Result lives in `Document.extractedFields` JSONB

**Phase D4 sub-features (shipped 2025-05-22):**
- **D4.1 (PR #237)** — Password-protected PDFs: user provides password in drawer, retry decrypts in-memory, clears `needsPassword` flag.
- **D4.2 (PR #238)** — Inline edit of parsed rows + confidence badge (low/medium/high based on row count, balance reconciliation, bank/period/account-number presence) + auto bank-account match on Import dialog (matches last 4 digits).
- **D4.3 (PR #239)** — Auto-link bank credits/debits to outstanding Invoices/Bills. `suggestMatchesForBankRows()` in `lib/documents/match-bank-transactions.ts`. Tolerance ±₹1 OR ±2%; date window 60 days before row. UI: `SuggestedMatchesPanel` above the Transactions panel.
- **D4.4 (in flight)** — Claude API fallback for unknown / unparseable layouts. Lib + tests written and pushed; wiring into actions + drawer is REMAINING work (see plan file).

## Key file paths to know (Documents module)

- `lib/documents/parsers/index.ts` — `parseBankStatement(text)` + `parseByDocumentType(text, type)`
- `lib/documents/parsers/bank-statement-types.ts` — `ParsedBankStatement` + `BankTransactionRow`
- `lib/documents/parsers/llm-fallback.ts` — **NEW (D4.4)**: `parseBankStatementWithLLM(text)` + `isLlmFallbackEnabled()`
- `lib/documents/pdf-extract.ts` — `extractPdfTextWithPassword(buffer, password?)`
- `lib/documents/document-classifier.ts` — `classifyDocument(text)`
- `lib/documents/bank-statement-confidence.ts` — `computeBankStatementConfidence()` (D4.2)
- `lib/documents/match-bank-transactions.ts` — `suggestMatchesForBankRows()` (D4.3)
- `app/(dashboard)/documents/actions.ts` — ALL server actions. Major ones:
  - `uploadDocumentsAction` (~line 556) — main upload, runs Smart Capture pipeline
  - `uploadBankStatementsAction` (~line 1224) — direct drop to Bank Statements inbox; forces `inbox=BANK_STATEMENTS` + `documentType=BANK_STATEMENT`
  - `retryExtractWithPasswordAction` (~line 1468) — re-runs extract with user-supplied password
  - `updateParsedBankStatementAction` (~line 1576) — D4.2 inline-edit persistence
  - `getBankRowMatchesAction` (~line 1691) — D4.3 AR/AP suggested matches
- `app/(dashboard)/documents/document-preview-drawer.tsx` — drawer with all panels (Password / Transactions+Confidence / SuggestedMatches / Bill / Receipt / SmartCapture text)

## Env vars (Vercel)

Required for full functionality:
- `DATABASE_URL` — Postgres connection
- `NEXTAUTH_SECRET` — auth signing
- `NEXTAUTH_URL` — canonical URL
- `BLOB_READ_WRITE_TOKEN` — auto-injected by Vercel Blob; do not set manually
- `MIGRATION_KEY` — protects `/api/admin/migrate`
- `QUIK_AUTO_MIGRATE=1` — runs migrations on cold start via `instrumentation.ts`

Optional (gates specific features):
- `ANTHROPIC_API_KEY` — enables D4.4 LLM fallback + the in-app chat assistant
- `RESEND_API_KEY` + `EMAIL_FROM` — enables transactional email
- `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` + `RAZORPAY_WEBHOOK_SECRET` — enables customer portal payments

## Recent prod state (snapshot at handoff)

- `main` HEAD: `d70adf2` (PR #239 — D4.3 AR/AP suggested matches merged)
- Prod deploy live: `quikfinance-software-ik8jri9xg-…` — ● Ready
- Pending PR: `feat/documents-d4-4-llm-fallback` (commit `37b36aa`, pushed but NOT yet opened as PR — see `docs/NEXT_SESSION_PROMPT.md`)

## Tone / interaction guidelines

- The user (Rishabh) drives fast: short messages ("yes", "do it", "next") expect proactive execution.
- Use `AskUserQuestion` for branching decisions; don't ask "should I proceed" — just proceed.
- Background long-running things (CI watches, deploy polls) via `run_in_background` so foreground stays responsive.
- When user shares a screenshot of Zoho, build to 1:1 match unless trade-offs warrant deviation; surface deviations explicitly.
- When asked "what did we do today?" — give a structured status report (shipped PRs / files touched / what's pending).

## Useful one-liners

```bash
# Run a single test file
pnpm test --run tests/unit/documents/parsers/llm-fallback.test.ts

# Full verify gauntlet
pnpm prisma generate && pnpm type-check && pnpm lint && pnpm test --run && pnpm build

# Watch CI green
gh pr checks <num> --watch

# Live prod logs (replace URL with current canonical)
vercel logs https://quikfinance-software.vercel.app

# Apply migrations manually (when QUIK_AUTO_MIGRATE not set)
curl -X POST -H "x-migration-key: $MIGRATION_KEY" \
  https://quikfinance-software.vercel.app/api/admin/migrate

# List prod deploys
vercel ls --prod | head -5
```

## Where to find the most recent plan

`C:\Users\user\.claude\plans\bubbly-frolicking-tulip.md` — Claude Code stores plans here. The top entry is the latest. Older plans are appended for historical context.

For new accounts that don't have access to that file: `docs/NEXT_SESSION_PROMPT.md` in this repo contains the focused continuation prompt and current task state.
