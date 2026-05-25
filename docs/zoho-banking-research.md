# Zoho Books Banking — Module Research + Quikfinance Gap Analysis

**Status:** Research / specification doc. No code changes yet.
**Author:** Claude + Rishabh
**Date:** 2026-05-12 (rev. 2026-05-12 with screenshot-driven updates)
**Source material:** Zoho Books public help docs at <https://www.zoho.com/books/help/banking/> **plus screenshots from Rishabh's live Zoho Books tenant** (Banking landing page + Connect Bank modal). Sections marked 📸 are confirmed by screenshots; the rest is inferred from public docs.
**Purpose:** Capture the full shape of Zoho's Banking module so we know exactly what to build in Quikfinance to reach feature parity.

---

## TL;DR — Zoho's Banking module has 9 sub-modules

```
Banking
├── 1. Add Bank or Credit Card     (auto-feeds via Yodlee / Token + manual)
├── 2. Bank Feeds                  (24h sync, MFA handling, deactivate, refresh)
├── 3. Bank Accounts list          (the bankslist page in the URL you sent)
│   └── per-account Dashboard      ("Latest Statement Details" — 6 metrics)
├── 4. Add Transaction             (manual Money In / Money Out)
├── 5. Import Bank Statement       (CSV / TSV / OFX / QIF / CAMT.053 / PDF)
├── 6. Match Transactions          (the heart of the module — bank line ↔ Quikfinance record)
├── 7. Transaction Rules           (auto-categorization on incoming feeds)
├── 8. Reconciliation              (closing balance ↔ cleared total)
└── 9. Record Deposit              (cash account → bank account transfer)
```

The URL you sent (`/banking/feeds/bankslist`) is **sub-module #3** — the master list of all your bank + credit-card + PayPal accounts.

Quikfinance currently has rough analogues of #1, #3 (partial), and #4. Everything else is missing.

---

# 1. Add Bank or Credit Card

## 📸 The three-tier integration model (confirmed from screenshot)

The "Connect Bank / Credit Card" modal in the live tenant shows three distinct integration tiers, not two:

| Tier | Banner label in modal | Banks shown | How it works |
|---|---|---|---|
| **A. Direct Partner-Bank APIs** | "Partner Banks Fetch feeds directly" — 5 large bank logos at the top of the modal | Standard Chartered, HSBC, Kotak Mahindra Bank, SBI, Axis Bank | Zoho has direct API contracts with each bank. Bypasses any third-party aggregator. Best UX: real-time sync, no MFA dance, multi-day backfill. |
| **B. Third-Party Feed Aggregator (Yodlee / Token)** | "Automatic Bank Feeds Supported Banks" — 9 bank/service cards in a 3-column grid + a "Connect Now" CTA | PayPal, ICICI Bank, HDFC Bank, SBI, Kotak, Axis (banking accounts) + HDFC Credit Card, SBI Credit Cards, American Express Cards | Goes through Yodlee's OAuth-like flow. 24h auto-sync; MFA banks require manual refresh once/day. |
| **C. Manual fallback** | "Add bank or credit card account manually" — single section with "Add Account" CTA | Any bank not in tiers A or B | User fills out account fields by hand. No auto-sync; user is responsible for statement upload. |

**Interesting overlap:** HDFC, SBI, Kotak, Axis appear in BOTH tier A (as partner-bank logos) AND tier B (as feed-supported cards). Zoho lets a Kotak user pick either the direct partner path (best UX) or the Yodlee fallback (if direct is misbehaving). Real-world resilience pattern — implies the data model treats them as separate connection options under one logical "BankAccount" row.

### Credit cards are a separate "account" type — same bank counted twice

In tier B, "HDFC Bank (India)" and "HDFC Bank (India) - Credit Card" appear as two distinct cards (the credit card variant has a "C" badge with the legend "C → Credit Card" at the bottom). Same for SBI: "State Bank of India (India) - Banking" + "State Bank of India Credit Cards (India)". And "American Express Cards (India)" is credit-card-only.

**Implication for the Quikfinance data model** (revised after seeing the actual Add-Account form in Screenshots 3 + 4):

```typescript
// Common fields (all types):
{
  type: "BANK" | "CREDIT_CARD" | "PAYPAL"
  accountName: string         // required
  accountCode?: string
  currency: string            // required, default "INR"
  bankName?: string
  description?: string        // max 500 chars
}

// Bank-only extra fields:
{
  accountNumber?: string
  ifsc?: string
  isPrimary?: boolean         // only one BANK can be primary per org
}

// Credit Card: NO extra fields beyond common at creation time.
// Zoho's credit-card form does NOT collect: card-last-4,
// credit limit, statement cycle date. These are either captured
// later in account settings, or simply not modelled.

// PayPal: not visible from screenshots — probably email + multi-currency picker.
```

**Important correction:** earlier drafts of this doc speculated credit cards have a "statement cycle date" and "credit limit" at creation. They don't — Zoho's form is just 6 fields (radio + name + code + currency + bank + description). For Quikfinance v1 we should match this minimalism. Defer credit-card-specific fields until a real customer asks.

Credit cards reverse balance polarity (a positive balance means you owe the bank), which still has to be respected in reports — but that's a reporting / GL concern, not a data-model concern at creation.

## 📸 Banking landing page (empty state) — confirmed from screenshot

When no banks are connected, the user lands on a page with this exact shape:

```
                Stay on top of your money

Connect your bank and credit cards to fetch all your transactions.
Create, categorize and match these transactions to those you have
in Zoho Books.

         [ Connect Bank / Credit Card ]  [ Add Manually ]

           Don't use banking for your business? Skip

      ▶ Watch how to connect your bank account to Zoho Books
```

UI elements:
- **Headline:** "Stay on top of your money" — single-line, centered
- **Sub-copy:** two-line description
- **Primary CTA:** "Connect Bank / Credit Card" — blue, prominent (opens the three-tier modal)
- **Secondary CTA:** "Add Manually" — outlined button (skips modal, goes straight to tier-C manual entry)
- **Skip link:** "Don't use banking for your business? Skip" — hides the module per-user (useful for service businesses with no bank ties)
- **Tutorial link:** play-icon + "Watch how to connect your bank account to Zoho Books" — embedded video

**Implication for Quikfinance:** BNK-A's empty state should mirror this. Quikfinance's existing `/banking` page is a tile-grid dashboard — that's the *non-empty* state. When zero `BankAccount` rows exist, swap to this empty-state pattern. ~half a day of work, big visual payoff.

## Three providers, two paths (legacy section title kept for diff continuity)

### Path A — Automatic Bank Feeds (Yodlee / Token)

User clicks **+ Add Bank or Credit Card** → picks bank from a search list → flow:

1. Select a "Bank Feeds Service Provider" (Yodlee in most regions, Token for some)
2. Agree to end-user terms for automatic feeds (compliance — required by Yodlee)
3. Enter bank login credentials (via Yodlee-hosted iframe / OAuth handoff)
4. Choose which account from the bank to connect (one customer can have multiple accounts at one bank)
5. Choose a start date for transaction history (max **90 days** of backfill)

After completion, Zoho fetches transactions **every 24 hours automatically** if the bank doesn't require MFA. With MFA, manual refresh only (rate-limited to once/day).

### Path B — Manual Account (unsupported bank)

User clicks **Add Account** instead. Fields:

| Field | Required | Notes |
|---|---|---|
| Account Type | yes | Bank / Credit Card |
| Account Name | yes | Display name |
| Account Code | yes | Unique short ID |
| Currency | yes | Single currency at creation (multi-currency only for PayPal) |
| Account Number | bank only | Optional for Credit Card |
| Bank Name | yes | |
| Bank Identifier Code | bank only | IFSC / IBAN / SWIFT |
| Location | optional | If multi-location org |
| Users | optional | Access control — which users can see this account |
| Description | optional | |

### Path C — PayPal / Stripe (special)

Treated as a "bank account" but with multi-currency baked in. Each currency PayPal supports becomes its own sub-feed inside one PayPal account.

## Implications for Quikfinance (revised after screenshot review)

Quikfinance currently has `/banking/accounts/new` with **a flat manual form only**. To reach Zoho parity we need a three-version build plan:

| Version | What ships | Effort | Unlocks |
|---|---|---|---|
| **v1 — Manual + CSV/OFX** | The empty-state UX + "Add Manually" form (BANK / CREDIT_CARD / PAYPAL types) + statement-upload wizard | ~1.5 weeks | 80% of tier-C functionality. Users get to a working banking module without any external integration. |
| **v2 — Yodlee tier-B feeds** | OAuth-style bank-picker modal + 24h sync cron + MFA refresh handling | ~3 weeks + Yodlee contract | The full tier-B experience for India + US banks. Same UX as Zoho's "Automatic Bank Feeds" section. |
| **v3 — Direct partner-bank APIs** | One-bank-at-a-time: start with ICICI Connected Banking (largest India market share), then HDFC, Axis | ~2 weeks per bank | Tier-A UX (real-time, no MFA dance). Differentiates Quikfinance against competitors who only have Yodlee. |

**Recommendation:** Start with v1. The CSV/OFX import already has 90% of the value with 20% of the integration cost. v2 unlocks zero-friction onboarding once Yodlee is justified. v3 is a competitive moat once you have paying customers asking for specific banks.

Bonus: the **empty-state page is just CSS + a `BankAccount.count() === 0` check** in the existing `/banking/page.tsx`. That alone is 4 hours of work and the visual feels like progress immediately.

---

# 2. Bank Feeds

## The auto-sync contract

| Behaviour | Detail |
|---|---|
| Frequency | Every 24h for non-MFA banks |
| MFA banks | Manual refresh required; "the bank will not allow Zoho Books to fetch the feeds automatically" |
| Rate limit | Manual refresh: once per day per account |
| Backend | Yodlee primary; some regions use Token. Migration path "to Yodlee's new API platform" mentioned |

## 📸 The Yodlee handoff flow — confirmed from Screenshots 5 + 6

Clicking "Connect Now" on the tier-B "Automatic Bank Feeds Supported Banks" section opens a 3-step in-modal flow:

### Step 1 — EULA acceptance gate

| UI element | Value |
|---|---|
| Modal title | "Connect and add your bank or credit card accounts" |
| Bank Feeds Service Provider | "Yodlee ▾" dropdown (Token is the documented alternative) |
| Info banner | "The End User License Agreement (EULA) describes the terms..." |
| Required checkbox | "I have read and agree to all the end user terms for automatic bank feeds" (link opens EULA) |
| Buttons | `[Proceed]` (disabled until checked) + `[Cancel]` |

**Compliance significance:** Zoho legally cannot pass user credentials to Yodlee without recorded consent. The Proceed button is grayed-out until the checkbox is ticked. Quikfinance v2 must mirror this exactly — no shortcut.

### Step 2 — Bank picker (Yodlee's embedded UI)

After Proceed, the modal shows Yodlee's bank search:

- Subtitle changes to: "If you don't find the bank that you're trying to connect with Zoho Books, select another service provider and search for the bank you want to connect."
- Service Provider dropdown stays visible (lets user switch mid-flow if their bank isn't in Yodlee)
- **Countdown timer:** "ⓘ You have **29:36** time remaining to connect your bank" — ~30 min session window
- Centered search input
- 4-column tile grid of featured banks (regional — US tenants see Chase / Wells Fargo / BoA / Capital One / Chime / Navy Federal / Fidelity / USAA / Huntington; Indian tenants presumably see ICICI / HDFC / etc.)
- Long bank names truncate with `...` (e.g. "First Internet Bank of ...", "Huntington Bank (Per...")
- Small `✕` in the grid area to back out of the picker without losing EULA consent

### 📸 Step 3 — Yodlee credential entry (confirmed from Screenshot 7)

The Yodlee FastLink iframe loads inside Zoho's modal. Outer Zoho chrome (provider dropdown + countdown timer) stays visible above the iframe.

**Inside the iframe (vertical layout):**

| Element | Detail |
|---|---|
| Back arrow `<` (top-left) | Returns to the bank picker — user can pick a different bank without losing EULA consent |
| Close `✕` (top-right) | Cancels the entire credential flow |
| Bank logo | Large, fetched from Yodlee's catalog (real bank branding, not Zoho's) |
| Prompt text | "Enter your **{Bank Name} ({ProductSegment})** credentials to connect your account(s) to Zoho Books." — bank name fully expanded here (vs the truncated tile in Step 2), with product segment in parens ("Commercial" / "Personal" — Yodlee's catalog distinguishes these) |
| Username | Standard text input, focused on load |
| Password | Password input + 👁 eye icon for show/hide |
| Yodlee terms disclaimer | "By continuing, you agree to **Yodlee's terms of use** for account linking. Yodlee's use of your data follows the application provider's privacy notice." |
| Submit button | Dark navy blue (Yodlee's brand color, not Zoho's — visual cue the iframe is Yodlee-hosted) |
| Footer attribution | "On behalf of Zoho · data access provided by **yodlee**" — required co-branding for transparency |

**Two layers of consent.** Zoho's EULA in Step 1 covers Zoho ↔ user. Yodlee's terms-of-use link in Step 3 covers Yodlee ↔ user. Standard aggregator-in-the-middle model.

**Credentials never touch Zoho's servers.** The Yodlee-branded iframe runs on Yodlee's domain. Zoho's outer page can't read what's typed inside. PCI/PSD2-compliant pattern.

### Step 4-6 — Account selection, backfill, sync start (not yet screenshotted)

After successful credential submission:
- **Step 4** — Yodlee returns the list of accounts at the bank; user picks which to sync. (Standard FastLink behaviour.)
- **Step 5** — Backfill window selector — Zoho's public docs say up to 90 days of history.
- **Step 6** — User lands back on the Zoho banking page; new account appears in the bankslist; first feed sync starts.

## Per-feed actions (gear-icon menu on each bank)

- **Refresh Feeds** — manual fetch, once/day cap
- **Update Credentials** — when bank password rotates
- **Deactivate Feeds** — pause auto-sync without deleting the account
- Per-PayPal: **Add/Remove Currency** sub-feeds

## What data each transaction carries (inferred — docs don't enumerate)

Standard bank-statement fields:
- Date (transaction date)
- Posting Date (when bank booked it)
- Description
- Reference / Cheque number
- Amount
- Type (Debit / Credit)
- Running Balance (post-transaction)

## Implications for Quikfinance

The auto-feed integration is **the single biggest piece of work** in this module. Two-tier plan:

- **v1 (no API integration):** CSV / OFX / QIF / CAMT.053 / PDF upload only. Users manually drop their bank statement. This unblocks 80% of the workflow for 20% of the effort.
- **v2 (Yodlee or Plaid):** Add automatic feeds for one provider. ~3 weeks of integration work + Yodlee contract / pricing.
- **v3 (India-native APIs):** ICICI / HDFC / Axis Connected Banking. Each is ~2 weeks separately.

---

# 3. Bank Accounts list (the `/bankslist` page)

This is the URL you sent — the master grid showing every bank + credit card + PayPal account.

## What it displays per account (inferred from screenshots in docs)

- Account name (clickable → drills into per-account dashboard)
- Bank logo / icon
- Currency
- Current balance (computed live: opening + all transactions)
- Last sync timestamp
- Last reconciled date
- Gear menu (Refresh / Update Credentials / Deactivate / Edit / Mark Inactive / Delete)

## Per-account dashboard (the "Latest Statement Details" panel)

Six tiles shown at the top of each bank's drill-down:

| Tile | Definition |
|---|---|
| **Total Transactions** | Count of imported transactions from the latest statement |
| **Autocategorised Transactions** | Auto-matched against transaction rules — no manual touch needed |
| **Recognised Transactions** | Matched against rules but needed manual confirmation |
| **Best Matches** | Bank lines that correspond to existing Quikfinance invoices/bills/payments |
| **Uncategorised Transactions** | Bank lines that hit no rule and have no obvious match — manual work |
| **Duplicates** | Same statement uploaded twice — auto-excluded by Zoho |

Plus: latest statement date, last reconciliation date, count of transaction rules configured for this account.

## Implications for Quikfinance

Quikfinance currently has `/banking/accounts` (list) and individual account pages, but NO drill-down dashboard with these 6 metrics. The metrics themselves are derived state — easy to compute once we have rules + matching + import infrastructure built. So this dashboard is the **last** thing we build, not the first.

---

# 4. Add Transaction (manual entry)

Two top-level categories:

### Money In

| Type | Use case |
|---|---|
| Customer Payment | Already-recorded invoice payment |
| Sales (without invoice) | One-off cash sale not tied to an invoice |
| Interest Income | Bank interest credit |
| Other Income | Misc credits — e.g. tax refund |
| Refund (from vendor) | Vendor returned money |
| Owner Investment | Owner adds capital |
| Deposit | Generic credit |

### Money Out

| Type | Use case |
|---|---|
| Vendor Payment | Already-recorded bill payment |
| Expense | One-off expense not tied to a bill |
| Owner Drawings | Owner withdraws capital |
| Transfer Fund | Move money to another bank account in the same org |
| Refund (to customer) | Customer refund |
| Card Payment | Pay down a credit card from a bank account |
| Owner Loan Repayment | Pay back loan from owner |

Each type carries different fields (Vendor combobox for Vendor Payment; Customer combobox for Customer Payment; etc.) and posts to different GL accounts automatically.

Attachments: up to 5 files, 5MB each.

## Implications for Quikfinance

Quikfinance has these as separate routes (`/banking/transactions`, `/banking/transfers`, `/banking/card-payments`, `/banking/owner-drawings`, `/banking/other-income`). The Zoho model is **one form with a `type` dropdown** that morphs the form fields. Their model is cleaner — a single `BankTransaction` create flow with branching UI. Worth a refactor when we touch this.

---

# 5. Import Bank Statement

The make-or-break flow for v1. Detailed shape:

## Supported file formats

- **CSV** (most common — every bank exports this)
- **TSV** (tab-separated — rare)
- **OFX** (Open Financial Exchange — US standard)
- **QIF** (Quicken Interchange — legacy but still used)
- **CAMT.053** (European ISO 20022 XML)
- **PDF** (parsed via Perfios — third-party OCR service; supports password-protected PDFs)

## The column-mapping wizard

Step 1 — User selects account + clicks **Import Statement**, uploads file.

Step 2 — **Amount column type** dropdown:
- **Double Column** — separate Debit and Credit columns
- **Single Column with Amount Type** — one Amount column + a Type column (DR/CR)
- **Single Column with Negative Values** — one Amount column where negatives are withdrawals

Step 3 — **Character Encoding + Delimiter**:
- Encoding: UTF-8 default; others if bank exports differently
- Delimiter: comma / tab / pipe / semicolon

Step 4 — **Field mapping**:
- Zoho auto-selects the best match for each field (Date, Description, Reference, Amount, Type)
- User can override
- Saves mapping as a preset (so next month's import is one-click)

Step 5 — **Preview**:
- Shows first 10 rows mapped
- Flags unmapped fields
- Flags rows with parse errors

Step 6 — **Commit**:
- All rows imported into `BankTransaction` table
- Duplicate detection runs immediately (see below)

## Duplicate detection

Logic (inferred from "Duplicates auto-excluded by Zoho"):
- Match on `(accountId, date, amount, reference)` quadruple
- Optional fuzzy match on description if reference is missing
- Duplicate rows are imported but marked `excluded=true` with reason "duplicate of TXN-xxx"
- User can override exclusion individually

## Undo last import

A gear-icon action on the per-account page lets you reverse the most recent import:
- Shows the count of transactions that will be deleted
- Lets user exclude specific ones from the undo (e.g., a transaction that's been reconciled since)
- Only the most recent import can be undone (older imports require manual delete)

## Implications for Quikfinance

This is **the v1 priority** — the entire module is gated on this flow. Reusable from Quikfinance's existing import pattern (`lib/purchases/import-helpers.ts` already has CSV parsing + column mapping for Bills/Vendors). The new addition is OFX/QIF/CAMT.053 parsers (each is an npm package).

PDF via Perfios — Quikfinance can defer; alternative is Textract / Google Cloud Vision OCR if a bank PDF parser becomes a real customer need.

---

# 6. Match Transactions (the heart of the module)

After a bank statement is imported, each row is either:

- **Auto-matched** — Zoho's matcher found one obvious existing record
- **Best match suggested** — multiple candidates; user picks
- **Uncategorised** — no candidate; user manually creates a new record OR categorizes to a GL account

## What gets matched against

A bank line can match against existing Quikfinance records:

- **Customer Payment** received
- **Vendor Payment** made
- **Manual Journal** entry
- **Invoice** (if no payment recorded yet — match creates the payment)
- **Bill** (same — match creates the payment)
- **Expense**
- **Transfer Fund** (the other side of an inter-account transfer)

## The match UI

Two-pane layout per bank transaction:

| Left pane (the bank line) | Right pane (candidates) |
|---|---|
| Date | List of Quikfinance records sorted by match score |
| Description | Each row: vendor/customer name, amount, type, date, status |
| Amount | Radio button to select |
| Reference | Filter pills: "Include Withdrawals", "Include Deposits", "Within ±5 days" |

Plus a **Create New Transaction** button — if no record matches, user creates the underlying record (invoice payment / vendor payment / expense) inline. That new record auto-matches itself to the bank line.

## Adjustment additions

For partial matches (e.g., bank line is ₹1000 but actual invoice was ₹950 + ₹50 payment-gateway fee):
- User selects the invoice as primary match
- Clicks **Add Adjustment**
- Creates a ₹50 expense ("Payment Gateway Charges") that combines with the invoice to equal ₹1000
- The combined bundle now matches the bank line cleanly

## Multi-statement matching

For complex cases (one deposit = sum of multiple invoices, or one withdrawal = sum of multiple bills):
- Toggle **Multi-select & Match**
- Select multiple Quikfinance records via checkboxes
- System shows combined total + matches against bank line

## Cross-type matching

- A deposit (Money In) can match withdrawals (Money Out) — for cashback / refund scenarios
- A withdrawal can match deposits — for reversed transactions
- Filter pills control this: "Include Withdrawals" / "Include Deposits"

## Categorise (no match available)

When no Quikfinance record matches:
- User picks a **GL account** (Office Expenses, Rent, Software Subscriptions, etc.)
- Optionally picks a **Vendor** or **Customer**
- Optionally adds a **Reference**, **Notes**, **Tax** treatment
- Zoho creates an Expense (Money Out) or Other Income (Money In) record automatically

## "Match" vs "Categorise" — the critical distinction

| Action | What it does | When to use |
|---|---|---|
| **Match** | Links the bank line to an existing Quikfinance record | The Quikfinance record was created BEFORE the bank statement landed |
| **Categorise** | Creates a NEW Quikfinance record on the fly | No existing record; bank line is the source of truth |

## Implications for Quikfinance

This entire module is **net-new in Quikfinance** — nothing exists today. It's the single biggest feature build in the Banking workstream. Probably **2 weeks** for a credible v1:
- Match-candidate suggestion engine (fuzzy match on amount + date + payee)
- The two-pane UI
- Auto-match on exact amount + date
- Categorize fallback flow
- Adjustment additions
- Multi-select

---

# 7. Transaction Rules

## Rule shape

A rule is: **IF [conditions] THEN [actions]**.

### Conditions

| Field | Operators |
|---|---|
| Payee | is, contains, starts with, is empty |
| Description | is, contains, starts with, is empty |
| Reference Number | is, contains, starts with, is empty |
| Amount | `=`, `>`, `>=`, `<`, `<=` |

Plus combinator: "ALL conditions match" (AND) or "ANY condition matches" (OR).

### Actions

When a rule fires:
- **Record As** — Deposit / Withdrawal / Transfer / Customer Payment / Vendor Payment / Expense
- **Account** — which GL account the transaction posts to
- **Paid Via / Payment Mode** — Cash, Cheque, Bank Transfer, UPI, etc.
- **Reference Number** — auto-populate from bank statement reference OR set a fixed value
- **Category** — "Recognised" (highlights for user confirmation) or "Categorised" (auto-finalised)

## Rule lifecycle

- Apply on **incoming feeds only** (not retroactive)
- Edit / Delete rules from a dedicated `/banking/rules` page
- Deleted rules don't un-categorize previously-categorized transactions

## What Zoho's docs do NOT mention (but real systems have)

- Rule **priority / order** — when multiple rules match, which wins?
- **Suggested rules** — "you've categorized 3 AWS transactions as Software; create a rule?"
- **Rule duplication** — copy a rule and tweak it
- **Test a rule** — preview which past transactions would have matched

These are likely either undocumented Zoho features OR genuine gaps. Both are worth building in Quikfinance.

## Implications for Quikfinance

New surface area — `/banking/rules` doesn't exist yet. New models:
- `BankRule` (conditions JSON + actions JSON + priority)
- Rule application happens during import, not at runtime

Effort: **~1 week** for v1 (single-condition rules), **+3 days** for AND/OR combinators, **+3 days** for suggested rules.

---

# 8. Reconciliation

## The setup

User → Banking → pick account → gear → **Reconcile Account** → **Initiate Reconciliation**.

Form fields:
- **Start Date** — beginning of reconciliation period
- **End Date** — end of period
- **Closing Balance** — what the bank statement says is the final balance

## The reconciliation screen

Two panes:

**Left** — All matched, categorised, and manually-added transactions in the period. Each has a checkbox to mark "Cleared".

**Right** — Running summary:
- Opening Balance (computed from last reconciliation's closing)
- Cleared Deposits (sum of checked Money In)
- Cleared Withdrawals (sum of checked Money Out)
- Net Cleared = Opening + Deposits − Withdrawals
- Bank's Closing Balance (from setup form)
- **Difference** = Net Cleared − Closing Balance

**Goal**: Difference must equal zero.

## When the difference is non-zero

The user can:
- Find missing transactions in Quikfinance (add them manually if Zoho missed a bank line)
- Edit the closing balance (if they mistyped from the statement)
- Mark transactions cleared/uncleared to balance

Zoho does NOT auto-resolve the discrepancy — that's the accountant's job.

## Finishing

Two options:
- **Reconcile** — finalize. Cleared transactions are locked from edits; opening balance for next period is set.
- **Save and Reconcile Later** — save progress, come back.

## Reverse / undo / delete

- **Undo Reconciliation** — unlocks all transactions in the period; useful when an error is discovered post-finalize
- **Delete Reconciliation** — removes the reconciliation record entirely; transactions stay but lose their cleared flag

## What Zoho's docs do NOT cover

- **Reconciliation report** — printable / PDF summary for auditors? Likely exists but not documented at this URL
- **Lock policy** — once reconciled, can you still edit the underlying invoice/bill that created the transaction? (Probably no — that's the point of the lock)

## Implications for Quikfinance

Reconciliation is **independent of matching** — you can match every transaction without ever reconciling, OR reconcile without using auto-match. So this can ship as a separate PR after matching.

Effort: **~1.5 weeks** for the full reconcile + undo + delete flow.

---

# 9. Record Deposit (the niche flow)

## What it is

A **deposit** is a transfer from a **cash account** to a **bank account**. Customer pays in cash → cash account credited. Later, owner deposits the cash at the bank → bank account credited, cash account debited.

Without this flow:
- Bank feed shows the deposit
- But Quikfinance has no record of the cash collection
- Reconciliation fails

## When NOT to use Record Deposit

- Customer pays via UPI / bank transfer / cheque — that's a regular customer payment, no deposit needed
- Vendor refunds money — that's a refund transaction, not a deposit

Deposit is **specifically for the cash → bank money movement**.

## Fields

- Date
- Receiving bank account
- Paid Via (cash account being drained)
- Reference number
- Bank charges (deduction if bank charges a fee on cash deposits)
- Optional: filter "Funds From" by customer / transaction type
- Attachments

## Implications for Quikfinance

Niche feature — only matters for cash-heavy businesses (retail, food service). Probably **defer to v2** unless an early customer specifically asks.

Effort if built: **~3 days**.

---

# Quikfinance — current state vs. Zoho parity

| Zoho feature | Quikfinance state today | Gap |
|---|---|---|
| Add Bank Account (manual) | ✅ `/banking/accounts/new` | Add Credit Card type + bank-picker UI for v2 |
| Auto Bank Feeds (Yodlee) | ❌ Not built | v2 — needs Yodlee contract + OAuth flow |
| Bank Accounts list | ✅ `/banking/accounts` | Missing per-account drill-down dashboard with 6 metrics |
| Per-account Dashboard (6 tiles) | ❌ Not built | Derived state — easy once rules + matching exist |
| Add Transaction (manual) | ✅ `/banking/transactions/new` + 5 specialized routes | Refactor to one form with `type` dropdown |
| Import Statement (CSV) | ❌ Not built | **v1 priority** — reuse `lib/purchases/import-helpers.ts` |
| Import Statement (OFX/QIF/CAMT) | ❌ Not built | npm libraries available; ~3 days each |
| Import Statement (PDF) | ❌ Not built | Needs OCR provider — defer |
| Duplicate detection on import | ❌ Not built | Logic is clear: `(accountId, date, amount, reference)` |
| Undo last import | ❌ Not built | Easy once import exists |
| Match Transactions UI | ❌ Not built | **v1 priority** — the biggest piece |
| Match candidate scoring | ❌ Not built | Fuzzy match on amount + date + payee |
| Add Adjustment in match | ❌ Not built | Part of match v1 |
| Multi-select match | ❌ Not built | v1 polish |
| Categorise (no-match fallback) | ❌ Not built | v1 priority |
| Transaction Rules (CRUD) | ❌ Not built | New `BankRule` model; ~1 week |
| Rule application on import | ❌ Not built | Apply during import flow |
| Suggested rules | ❌ Not built | Nice-to-have |
| Reconciliation flow | ❌ Not built | **v1 priority** — independent of matching |
| Undo / Delete Reconciliation | ❌ Not built | Part of reconcile v1 |
| Record Deposit (cash → bank) | ❌ Not built | Niche — defer |

---

# Suggested Quikfinance build order (revised after reading Zoho docs)

The roadmap doc earlier proposed BNK-1 through BNK-7. Here's the same plan **re-prioritized after reading Zoho's actual UX**:

| Order | PR | Scope | Effort | Why this order |
|---|---|---|---|---|
| 1 | BNK-A | **CSV import** with column mapping wizard + duplicate detection + undo | 1 week | Without statements, nothing else matters. Reuse `lib/purchases/import-helpers.ts`. |
| 2 | BNK-B | **Per-account dashboard** with 6 metric tiles (the page in the URL you sent) | 4 days | The first user-visible "this looks like Zoho" win. Derived state, no new models. |
| 3 | BNK-C | **Match Transactions UI** — two-pane layout, candidate scoring, single-match flow | 1.5 weeks | The functional heart. Without matching, imports just create orphaned BankTransaction rows. |
| 4 | BNK-D | **Categorise (no-match fallback)** + Add Adjustment + Multi-select | 1 week | Extends BNK-C to handle the long-tail of cases. |
| 5 | BNK-E | **Transaction Rules** CRUD + apply-on-import + suggested rules | 1.5 weeks | After matching exists, rules automate the boring matches. |
| 6 | BNK-F | **Reconciliation** flow (initiate + clear + finish + undo + delete) | 1.5 weeks | Independent of everything else; can run in parallel with BNK-E if 2 engineers. |
| 7 | BNK-G | **OFX/QIF/CAMT.053 parsers** | 3 days | One library per format; adds to the import options dropdown. |
| 8 | BNK-H | **Multi-currency** bank accounts + FX rate cron | 1.5 weeks | Real for orgs with USD/INR mix; otherwise defer. |
| 9 | BNK-I | **Record Deposit** flow | 3 days | Cash-heavy businesses only. |
| 10 | BNK-J | **Yodlee / Plaid auto-feeds** | 3 weeks | Game-changer for UX but needs vendor contract. Build only if budget justifies. |
| 11 | BNK-K | **India-native bank APIs** (ICICI / HDFC / Axis Connected Banking) | 2 weeks each | Per-bank work; do one bank as proof, then scale. |

**Total v1 (BNK-A through BNK-F): ~7 weeks.** That's a feature-complete clone of Zoho Banking minus the auto-feeds.

**With auto-feeds (add BNK-J): ~10 weeks.**

---

# What I need from you to start BNK-A

1. **Sample bank statement CSV** — pick one bank you use (ICICI, HDFC, Axis, SBI, etc.) and send me a redacted sample of the export. I'll use it as the test fixture so column auto-mapping works for that bank out of the box.
2. **OFX/QIF priority?** — Do your target customers use US banks (OFX is standard) or India-only (CSV is enough)?
3. **Yodlee budget?** — Yodlee charges per "connected account per month" (~$1-2 each). Do we have the budget for this in v1, or pure CSV until v2?
4. **One Quikfinance bank account = one Zoho-equivalent?** — i.e., do we need PayPal-style sub-accounts under one parent, or is each currency a separate top-level bank account?
5. **Reconciliation strictness** — once a transaction is "cleared" in a reconciled period, do we hard-block edits (Zoho style) or warn-and-allow (more lenient)?

Once those five are answered, **BNK-A starts on Day 1** of the next sprint.

---

# Appendix — Confirmed from screenshots vs inferred from public docs

This doc combines two sources. Here's exactly which claims are which:

## 📸 Confirmed (from Rishabh's tenant screenshots)

- **Three-tier integration model** — Partner Banks / Automatic Feeds / Manual, with the exact 5 partner-bank logos (Standard Chartered, HSBC, Kotak, SBI, Axis) and 9 Yodlee-supported cards.
- **Credit cards are a separate account type** — HDFC and SBI appear twice in the modal: once as bank accounts, once as credit cards (marked with "C" badge).
- **American Express Cards (India)** is in the tier-B credit-card section.
- **PayPal is in tier B** — not a special tier-A partner.
- **Empty-state copy verbatim**: headline "Stay on top of your money", sub-copy "Connect your bank and credit cards to fetch all your transactions...", primary CTA "Connect Bank / Credit Card", secondary "Add Manually", skip link, tutorial-video link.
- **Top-level sidebar IA**: Home → Items → Sales → Purchases → Time Tracking → Banking → Accountant → Reports → Documents. Banking sits between Time Tracking and Accountant.
- **APPS section** at the bottom of the sidebar lists "Zoho Payroll" and "Zoho Payments" — Zoho's app-launcher pattern. Direct analogue to Quikit.
- **Free-trial paywall** banner at the top: "Your free trial is over · Subscribe".
- **Add Bank or Credit Card form — exact field list per type:**
  - Bank type: Account Type radio, **Account Name***, Account Code, **Currency*** (INR default), Account Number, Bank Name, IFSC, Description (max 500 chars), Make this primary checkbox
  - Credit Card type: Account Type radio, **Account Name***, Account Code, **Currency*** (INR default), Bank Name, Description (max 500 chars). **No Account Number, no IFSC, no Make-this-primary checkbox.**
- **Credit card form is dramatically simpler than initially assumed** — no statement-cycle-date, no credit-limit, no card-last-4 fields at creation time.
- **Yodlee handoff is 3 verified steps** (Screenshots 5 + 6 + 7): (1) EULA acceptance with provider-selector dropdown, (2) bank picker with 30-min session timer + searchable Yodlee catalog, (3) Yodlee FastLink credential iframe — bank logo, Username + Password fields, Yodlee terms disclaimer, dark-blue Submit, "On behalf of Zoho · data access provided by yodlee" co-branded footer.
- **Two layers of consent** in the handoff: Zoho's EULA (Step 1) for "automatic bank feeds" + Yodlee's terms-of-use (Step 3) for "account linking." Aggregator-in-the-middle pattern.
- **Yodlee catalog distinguishes bank product segments** — "First Internet Bank of Indiana (Commercial)" suggests separate catalog entries for Personal vs Commercial / Business / Brokerage variants of the same bank.
- **Yodlee FastLink iframe runs on Yodlee's domain** — Submit button is Yodlee's brand navy, not Zoho's blue. Credentials never touch Zoho's servers.
- **EULA is a hard gate** — the Proceed button is disabled until the consent checkbox is ticked. Compliance scaffolding, not optional.
- **Provider selector is a dropdown** ("Yodlee ▾" with chevron) — implies alternatives (Token in some regions). Mid-flow switching is supported.
- **30-minute session timeout** on the Yodlee picker — countdown shown in the header ("You have 29:36 time remaining"), expires the connection attempt.
- **Featured bank tiles are regional** — Indian tenants see ICICI/HDFC/SBI/Kotak/Axis (Screenshot 2); US tenants see Chase/Wells Fargo/BoA/Capital One/Chime/Navy Federal/Fidelity/USAA/Huntington (Screenshot 6). Yodlee's full catalog is searchable beyond the featured set.
- **Bank-name overflow** uses ellipsis truncation in tiles ("First Internet Bank of ...", "Huntington Bank (Per...").

## 🔍 Inferred (from public Zoho help docs only)

- The 24h auto-sync frequency for non-MFA banks
- MFA-bank manual-refresh limit of once per day
- Yodlee backend (their docs reference "Yodlee's new API platform")
- Per-transaction fields captured by feeds (Date, Posting Date, Description, Reference, Amount, Type, Running Balance) — Zoho docs don't enumerate
- The two-pane Match Transactions UI layout (docs describe the actions, not the visual layout)
- The Multi-select & Match toggle behaviour
- Reconciliation summary fields (Opening Balance, Cleared Deposits, Cleared Withdrawals, Difference)
- Rule priority / order (not mentioned in docs)
- Suggested-rules feature (not mentioned in docs)
- Duplicate-detection quadruple `(accountId, date, amount, reference)` — inferred from "duplicates auto-excluded" behaviour

## ❓ Still unknown (would need more screenshots or a live walkthrough)

- The exact field list when you click into a single bank in the bankslist page
- The gear-menu items per bank (the doc mentions Refresh / Update Credentials / Deactivate but doesn't list everything)
- The exact column-mapping wizard UI in the import-statement flow
- The match-transactions screen's actual layout (left/right pane proportions, filter pills)
- The reconciliation report PDF format (if any)
- Whether suggested rules exist + how they're surfaced
- Rule priority handling when multiple rules match one transaction
- **Yodlee Step 4-6** — account selection from the bank, backfill date-range picker, and the final "success / new account appears" state
- **MFA challenge UX** — what happens when a bank requires OTP / security question after the initial Submit
- The alternative bank-feeds provider catalog (the "Yodlee ▾" dropdown's other option, likely Token)
- The **edit** form for an existing account (whether credit-limit / statement-cycle fields appear there even though they're hidden at creation)
- The PayPal account creation form (multi-currency picker)

If you can send screenshots of any of these, I'll update the appendix and the relevant sections.
