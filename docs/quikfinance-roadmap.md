# Quikfinance — Remaining Work + Quikit Integration

**Status:** Roadmap / planning doc. No code changes yet.
**Author:** Claude + Rishabh
**Date:** 2026-05-12
**Audience:** Engineering / product / stakeholders deciding what to build next.

---

## TL;DR

Three modules need work to reach production parity, and one big integration question remains:

| Workstream | Current state | Remaining scope | Effort |
|---|---|---|---|
| **Banking** | 6 sub-pages built (Accounts, Transactions, Transfers, Card Payments, Owner Drawings, Other Income) — all create + list flows | Bank feeds, reconciliation, CSV/OFX import, rules engine, multi-currency | **~4–6 weeks** |
| **Accountant** | Chart of Accounts + Manual Journals + Journal Entries scaffolded | Trial Balance, General Ledger drill-down, Period locking, Year-end close, Recurring journals, Fixed Assets register, Budgets | **~4–6 weeks** |
| **Reports** | 8 reports live (P&L, BS, CF, AR/AP Aging, Sales/Tax Summary, GSTR-1, Stock Valuation) | GSTR-3B, GSTR-2A recon, Trial Balance report, TDS forms, customer/vendor statements, custom report builder, Excel export, scheduled reports | **~3–4 weeks** |
| **Quikit merge** | Quikit + Quikfinance on separate Vercel domains, separate auths | SSO redirect (Phase 1) → optional iframe/proxy embed (Phase 2) | **~2 weeks for Phase 1** |

**Total to finish:** ~13–18 weeks (3–4 calendar months) for one full-time engineer.

---

# Part 1 — Banking module

## What's shipped today

| Route | State | Notes |
|---|---|---|
| `/banking` | ✅ Tile landing | Shows count of active accounts |
| `/banking/accounts` | ✅ List + New | Full CRUD for bank accounts (name, currency, opening balance, default account flag) |
| `/banking/transactions` | ✅ List + New | Manual entry of debit/credit, account filter, ref / notes |
| `/banking/transfers` | ✅ List + New | Inter-account money movement (with paired debit/credit) |
| `/banking/card-payments` | 🟡 Stub | Schema exists; UI is bare-bones — needs validation, categorization |
| `/banking/owner-drawings` | 🟡 Stub | Drawings as a special transaction kind; needs Owner Equity account auto-pairing |
| `/banking/other-income` | 🟡 Stub | Inverse of Owner Drawings — credits an "Other Income" account |

## What's missing (priority-ordered)

### 1. Bank feeds / statement upload (HIGH priority)
Real businesses need to import their bank statement instead of typing every transaction.

- **CSV upload** — let users upload a bank-statement CSV, map columns (Date / Description / Debit / Credit / Reference), preview, commit
- **OFX / QIF / MT940 parsers** — Indian and US banks all export at least one of these. Optional but valuable
- **PDF statement OCR** — Indian banks email PDF statements; OCR them via a 3rd-party (Textract, Google Cloud Vision)
- **API-based bank feeds** — Plaid (US), Yodlee, ICICI Connected Banking, HDFC API, Axis API. Each is a separate integration with its own auth flow

**Suggested first PR:** CSV upload only. Use the existing import-wizard pattern from `lib/purchases/import-helpers.ts`. ~1 week.

### 2. Bank reconciliation workflow (HIGH priority)
Match imported bank transactions against existing invoices, bills, and payment records.

- **"Reconcile" page** — left column: unmatched bank transactions. Right column: open invoices/bills with the same vendor/customer + similar amount. One-click match
- **Bulk auto-match** — for transactions that match exactly on amount + reference, auto-confirm
- **Discrepancy report** — closing bank balance vs Quikfinance's recorded balance for the account
- **Reconcile-period locking** — once a month is reconciled, lock those transactions from edits

**Effort:** ~1.5 weeks. Schema is mostly ready — `BankTransaction` already has nullable FKs to `Invoice` / `Bill` / `PaymentReceived` / `PaymentMade`.

### 3. Rules engine for auto-categorization (MEDIUM priority)
Recurring transactions (Netflix, AWS, Rent) should auto-categorize without manual touch.

- **Rule shape:** `IF description CONTAINS "AWS"` → categorize as Software Expense, account = `6100`
- **Apply on import** — every uploaded transaction passes through user's rules first
- **Suggested rules** — after 3 manual same-vendor categorizations, propose a rule

**Effort:** ~1 week. New `BankRule` model + a small UI.

### 4. Multi-currency bank accounts (MEDIUM priority)
USD account showing a USD balance, INR home-currency P&L. Currently `BankAccount.currency` exists but exchange-rate booking isn't wired.

- **Per-transaction FX rate** — store both amounts (USD + INR equivalent at txn date)
- **Realized/unrealized gain-loss** — month-end FX revaluation journal
- **FX rate source** — ECB / RBI feed, or manual

**Effort:** ~1.5 weeks. Needs a `CurrencyRate` model + cron to refresh daily.

### 5. Card statement upload (LOW priority)
Same shape as bank statements but on the credit-card side. Reuses the CSV-upload work.

**Effort:** ~3 days once #1 lands.

## Banking module — suggested PR breakdown

| PR | Scope | Effort |
|---|---|---|
| BNK-1 | CSV upload + column mapping + preview + commit | 1 week |
| BNK-2 | Reconciliation page (manual match) | 1 week |
| BNK-3 | Auto-match on exact amount + date | 3 days |
| BNK-4 | Categorization rules (CRUD + apply-on-import) | 1 week |
| BNK-5 | Multi-currency support + FX rate cron | 1.5 weeks |
| BNK-6 | OFX/QIF parser + PDF OCR (optional, may defer) | 1 week |
| BNK-7 | Card-payment statement upload | 3 days |

**Total: ~5–6 weeks.**

---

# Part 2 — Accountant module

## What's shipped today

| Route | State | Notes |
|---|---|---|
| `/accountant` | ✅ Tile landing | Shows account count + manual journal count |
| `/accountant/chart-of-accounts` | ✅ List + New | Code, name, type (Asset/Liability/Equity/Income/Expense/COGS/Other Income), active flag |
| `/accountant/manual-journals` | ✅ List + New | Free-form debit/credit lines with reference + notes |
| `/accountant/journal-entries` | 🟡 Stub | List page exists; new form is bare-bones; auto-generated entries from invoices/bills not displayed |

## What's missing (priority-ordered)

### 1. Trial Balance (HIGH priority)
Every accountant's bread-and-butter. Lists every GL account with debit and credit totals for a date range.

- **Page** at `/accountant/trial-balance` (or `/reports/trial-balance`)
- **Drill-down** — click an account → general-ledger view of every transaction
- **Period selector** — month-to-date, quarter, fiscal year, custom range
- **Export to Excel + PDF**

**Effort:** ~3 days. The query is straightforward (`SUM(amount) GROUP BY accountId, debitOrCredit`).

### 2. General Ledger viewer (HIGH priority)
Drill-down view that shows every transaction touching a specific GL account.

- **Page** at `/accountant/general-ledger/[accountId]` or as a Trial-Balance drill-through
- **Filters** — date range, debit-only / credit-only, search by reference
- **Running balance column** — chronological balance after each transaction
- **Export**

**Effort:** ~3 days. Reuse the existing `JournalEntryLine` query pattern.

### 3. Period locking + fiscal year close (HIGH priority)
Once an accountant signs off on a month/year, no one should be able to edit transactions in that period.

- **`FinancialPeriod` model** — start, end, status (Open/Closed/Locked), closedBy, closedAt
- **Middleware on mutations** — Bill / Invoice / Payment / Journal save actions check the date and reject if it falls in a Closed period
- **Year-end close wizard** — auto-generates closing entries (Income/Expense → Retained Earnings)
- **Unlock action** — admin-only, audit-logged

**Effort:** ~1 week. Touches every transaction action layer.

### 4. Recurring journals (MEDIUM priority)
Monthly depreciation entries, prepayment amortizations, accruals — all repeat. Reuse the Recurring Bills pattern.

- **`RecurringJournal` model** mirroring `RecurringBill`
- **Cron** at `/api/cron/recurring-journals` (add to `vercel.json`)
- **CRUD UI** at `/accountant/recurring-journals`

**Effort:** ~1 week. Clone the Recurring Bills shape from `lib/purchases/recurring.ts`.

### 5. Fixed Assets register (MEDIUM priority)
Track depreciable assets — laptops, vehicles, furniture — with automatic monthly depreciation journals.

- **`FixedAsset` model** — purchase date, cost, life, depreciation method (SL/WDV), salvage
- **Page** at `/accountant/fixed-assets` — list with current book value + accumulated depreciation
- **Auto-depreciation cron** — monthly journal posting

**Effort:** ~1 week.

### 6. Budgets & variance (LOW priority)
Set a budget per account per month → compare to actuals.

- **`Budget` model** — accountId, period, amount
- **Variance report** at `/reports/budget-vs-actual`

**Effort:** ~4 days.

### 7. Accountant-role permissions (LOW priority)
Zoho lets you invite your CA with a special "Accountant" role — read everything, write journals + Chart of Accounts, no access to settings/users/billing.

- **Add `ACCOUNTANT` enum to `OrganizationMembership.role`**
- **`requireAccountant()` helper** alongside `requireOrganization()`
- **Settings page** that lists members + role chips

**Effort:** ~3 days. Mostly auth-helper plumbing.

## Accountant module — suggested PR breakdown

| PR | Scope | Effort |
|---|---|---|
| ACC-1 | Trial Balance page + drill-down | 3 days |
| ACC-2 | General Ledger viewer | 3 days |
| ACC-3 | Period locking infrastructure | 1 week |
| ACC-4 | Year-end close wizard | 4 days |
| ACC-5 | Recurring journals | 1 week |
| ACC-6 | Fixed Assets register + depreciation cron | 1 week |
| ACC-7 | Budgets + variance report | 4 days |
| ACC-8 | Accountant role + permissions | 3 days |

**Total: ~5–6 weeks.**

---

# Part 3 — Reports module

## What's shipped today

| Report | Route | State |
|---|---|---|
| Profit & Loss | `/reports/profit-loss` | ✅ |
| Balance Sheet | `/reports/balance-sheet` | ✅ |
| Cash Flow (with chart) | `/reports/cash-flow` | ✅ |
| Receivables Aging (AR) | `/reports/ar-aging` | ✅ |
| Payables Aging (AP) | `/reports/ap-aging` | ✅ |
| Sales Summary | `/reports/sales-summary` | ✅ |
| Tax Summary | `/reports/tax-summary` | ✅ |
| GSTR-1 Export | `/reports/gstr1` | ✅ |
| Stock Valuation | `/reports/stock-valuation` | ✅ |

## What's missing (priority-ordered)

### 1. GSTR-3B export (HIGH — India compliance)
Monthly summary return — every GST-registered business in India must file this.

- **Page** at `/reports/gstr3b`
- **Auto-compute** outward supplies, inward supplies, ITC claims, net liability
- **JSON + PDF download** matching GSTN portal format

**Effort:** ~1 week. Reuses GSTR-1 computation primitives.

### 2. GSTR-2A / 2B reconciliation (HIGH — India compliance)
Match purchase invoices against ITC available in the GSTN portal — flag missing/mismatched bills.

- **Upload GSTR-2A JSON** from the portal
- **Match against Quikfinance bills** by GSTIN + invoice number + amount
- **Mismatch report** — bills you've booked but seller hasn't filed, OR seller has filed but you haven't booked

**Effort:** ~1.5 weeks.

### 3. Trial Balance + General Ledger reports (MEDIUM — overlaps with Accountant work)
Already listed under Accountant module. Whichever ships first wins — list-based reports + drill-down.

### 4. TDS reports / Form 24Q + 26Q (HIGH — India compliance)
TDS deducted on payments to vendors → quarterly Form 26Q export.

- **`TdsDeduction` aggregate** — already captured per Payment Made
- **Quarterly Form 26Q export** — TXT / FVU format
- **TDS certificate** (Form 16A) — PDF generator

**Effort:** ~1.5 weeks.

### 5. Customer & Vendor statements (MEDIUM priority)
Per-customer or per-vendor PDF report showing every transaction + running balance for a date range.

- **`/reports/customer-statements/[id]`** with date picker + email-to-customer button
- **`/reports/vendor-statements/[id]`** mirror

**Effort:** ~4 days.

### 6. Inventory aging (LOW priority)
For each item, how long has it been in stock? Identifies slow-moving inventory.

**Effort:** ~3 days.

### 7. Sales by Customer / Item / Region (LOW priority)
Drill-down summaries already in Sales Summary, but full report views with filters + export.

**Effort:** ~4 days.

### 8. Custom report builder (LOW priority — high payoff)
"Pick fields → group by → filter → save view." Zoho/Tally don't do this well; could be a differentiator.

**Effort:** ~3 weeks. Big project.

### 9. Excel export + scheduled email (MEDIUM — across all reports)
Every existing report should have an "Export to Excel" button (today: PDF only on some). Plus: schedule a report to email every 1st of the month.

- **`exceljs` library** for Excel generation
- **`/api/cron/scheduled-reports`** daily, checks `ReportSchedule` table

**Effort:** ~1 week.

## Reports module — suggested PR breakdown

| PR | Scope | Effort |
|---|---|---|
| RPT-1 | GSTR-3B export | 1 week |
| RPT-2 | GSTR-2A reconciliation | 1.5 weeks |
| RPT-3 | TDS Form 26Q + Form 16A | 1.5 weeks |
| RPT-4 | Customer & Vendor statements | 4 days |
| RPT-5 | Excel export across all reports | 4 days |
| RPT-6 | Scheduled-reports cron + email | 3 days |
| RPT-7 | Inventory aging | 3 days |
| RPT-8 | Sales drill-downs | 4 days |
| RPT-9 | Custom report builder (defer / separate sprint) | 3 weeks |

**Total: ~3–4 weeks** (excluding the custom builder).

---

# Part 4 — Quikit Integration

(Condensed from `docs/quikit-integration.md` — full version in that file + the matching `.docx`.)

## Goal

Surface Quikfinance as an app inside the Quikit platform at <https://quik-it-auth.vercel.app/apps>. Users sign into Quikit once and reach Quikfinance from the app launcher.

## Four ways to "merge" — and the recommendation

| Option | What user sees | Effort | Recommendation |
|---|---|---|---|
| **A. SSO redirect** | Click Quikfinance tile in Quikit `/apps` → hops to `quikfinance.vercel.app` already signed in. Two URLs, one identity. | **1–2 weeks** | ✅ **Start here** |
| **B. Iframe embed** | Quikfinance renders inside Quikit's chrome at `quikit.com/apps/quikfinance`. One URL bar. | +1 week on top of A | 🟡 Only if unified UI is non-negotiable |
| **C. Reverse-proxy mount** | Same single-URL feel via Vercel rewrites. | 3–4 weeks | 🟡 Sneakily complex (asset URLs, cookies, cron) |
| **D. Full code merge** | One repo, one DB, one product. | 2–3 months | ❌ Only if consolidating products |

## Option A — SSO redirect (Phase 1, recommended)

### Flow

1. User logs into Quikit at `auth-quikit.vercel.app`
2. Lands on Quikit's `/apps` page
3. Clicks the **Quikfinance** tile
4. Quikit generates a short-lived signed JWT (5-min exp): `{ sub, email, name, tenantId }`
5. Browser redirects to `https://quikfinance-software.vercel.app/api/auth/sso?token=<jwt>`
6. Quikfinance verifies the JWT, upserts the user + organization, sets a NextAuth session cookie, redirects to `/`
7. User lands on Quikfinance dashboard, authenticated

### Quikfinance-side changes (~470 LOC new code)

| File | Change |
|---|---|
| `app/api/auth/sso/route.ts` | NEW — GET handler that verifies JWT, upserts user/org via Prisma, signs in via NextAuth credentials provider, redirects to `/` |
| `lib/auth.ts` | Add second `Credentials` provider with id `quikit-sso` |
| `lib/quikit-sso.ts` | NEW — JWT verification + user-provisioning helper |
| `.env.example` | Add `QUIKIT_SSO_ISSUER`, `QUIKIT_SSO_AUDIENCE`, `QUIKIT_SSO_SECRET` (HS256) |
| `prisma/schema.prisma` | Add `User.quikitId` + `Organization.quikitTenantId` (unique) |
| `middleware.ts` | Allow-list `/api/auth/sso` in PUBLIC_PATHS |
| `tests/unit/sso.test.ts` + `tests/e2e/quikit-sso.spec.ts` | New test coverage |

### Quikit-side changes

| File | Change |
|---|---|
| Apps registry | Add Quikfinance tile: `{ id: 'quikfinance', name: 'Quikfinance', launchUrl: '/api/launch/quikfinance' }` |
| `app/api/launch/quikfinance/route.ts` | NEW — mints JWT, redirects to Quikfinance |
| Env var | `QUIKFINANCE_SSO_SECRET` (matches Quikfinance's value) |

### Security checklist

- [ ] JWT TTL ≤ 5 minutes
- [ ] Audience claim enforced (token for one app can't unlock another)
- [ ] One-time `jti` tracked ~10 min to defeat replay
- [ ] Shared secret stored as encrypted env on Vercel both sides
- [ ] Audit log writes `SsoSignIn` per exchange
- [ ] No JWT logged anywhere (Sentry breadcrumb filter)

### Effort

| Task | Days |
|---|---|
| Quikit-side launch endpoint | 2 |
| Quikfinance `/api/auth/sso` + JWT verifier + provisioning | 3 |
| Unit + Playwright tests | 2 |
| Docs + DECISIONS update | 0.5 |
| End-to-end manual smoke + bugfixes | 1.5 |
| **Total** | **~9 working days (~2 weeks calendar)** |

## Phased rollout

| Phase | Scope | Outcome |
|---|---|---|
| **Phase 1 (week 1-2)** | Option A — SSO redirect | Quikfinance tile in Quikit `/apps` clicks through to live app. Two URLs, one identity. |
| **Phase 2a (week 3-4, optional)** | Layer Option B (iframe) on top | Quikfinance renders inside Quikit's chrome. One URL bar. |
| **Phase 2b (week 5+, alternative)** | Option C — reverse proxy | Same single-URL feel via Vercel rewrites. Bigger lift. |
| **Phase 3 (future)** | Data integration | Quikit user directory ↔ Quikfinance Contact table; Quikit billing ↔ Quikfinance subscription state; unified audit log |

## Open questions (need answers before Phase 1)

1. **Who owns Quikit?** If third-party, follow their dev docs. If you own both, you can dictate the contract.
2. **Does Quikit already have an SSO pattern** for other apps? Follow it if yes.
3. **Tenant cardinality** — one Quikit tenant per Quikfinance org, or many?
4. **Sign-out propagation** — sign out of Quikfinance kills only the Quikfinance session, or bubbles back to Quikit? (Standard answer: only Quikfinance.)
5. **Provisioning flow** — net-new Quikit user clicking the tile auto-gets a Quikfinance org with seed chart-of-accounts, or pre-provisioned?

## Risks + rollback

| Risk | Mitigation |
|---|---|
| Shared SSO secret leaks | Rotate via env update + redeploy; 5-min token TTL minimizes damage window |
| Quikit auth changes break Quikfinance SSO | Sentry alert on 4xx/5xx rate; Quikit-side regression tests |
| User upserts create duplicate orgs | `Organization.quikitTenantId @unique` enforces at DB level |
| Quikfinance feature breaks in embedded mode (e.g., Razorpay) | Phase 1 (Option A) avoids this entirely — Quikfinance stays standalone |

**Rollback for Phase 1:** Remove the Quikfinance tile from Quikit. Direct users back to `quikfinance-software.vercel.app/login`. No Quikfinance-side code revert needed — env-var feature flag toggles the SSO route off if needed.

---

# Suggested overall sequence

If a single full-time engineer picked this up tomorrow, the smart ordering is:

| Order | Workstream | Why this order |
|---|---|---|
| 1 | **Quikit SSO (Phase 1)** | 2 weeks. Unlocks the user-visible "Quikfinance is in Quikit" win first. Smallest scope; biggest perception payoff. |
| 2 | **Banking — CSV upload + reconciliation** | 3 weeks. Highest-impact missing feature for actual accounting users. |
| 3 | **Accountant — Trial Balance + General Ledger + Period locking** | 2.5 weeks. Required for any serious finance team to trust the books. |
| 4 | **Reports — GSTR-3B + TDS forms + Customer/Vendor statements** | 3 weeks. India compliance + day-to-day reporting basics. |
| 5 | **Banking — Rules engine + Multi-currency + Card statements** | 2.5 weeks. |
| 6 | **Accountant — Recurring journals + Fixed Assets + Budgets** | 2.5 weeks. |
| 7 | **Reports — GSTR-2A recon + Excel export + scheduled reports** | 2 weeks. |
| 8 | **Quikit Phase 2 (iframe OR proxy)** | 1–4 weeks depending on choice. |
| 9 | **Polish / spec niceties / Accountant role permissions** | 1–2 weeks. |
| 10 | **Custom report builder (optional differentiator)** | 3 weeks. |

**Grand total:** ~22–28 weeks of focused engineering (5-7 months for one engineer; 3-4 months for two).

---

# Decisions you need to make before kickoff

1. **Banking — bank-feed strategy.** CSV-only forever, or invest in API integrations (Plaid for US, ICICI / HDFC / Axis Connected Banking for India)? API integrations are 2-3 weeks each per bank but transform user experience.
2. **Accountant — period-locking strictness.** Hard-block edits in closed periods (Tally / SAP style), or warn-then-allow (Zoho style)?
3. **Reports — Indian-only vs multi-region.** GSTR-3B / TDS forms only matter for Indian users. Do non-Indian customers exist? If yes, prioritize Excel export + statements over compliance reports.
4. **Quikit merge — own both apps or third-party?** Changes the entire integration approach.
5. **Resourcing.** Solo developer for 6 months, or scale to 2-3 engineers and finish in 3-4 months?

Once these five are answered, the workstreams above can run in parallel and the timeline compresses.
