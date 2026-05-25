/* eslint-disable */
// Generator: docs/quikfinance-roadmap.md  ->  docs/quikfinance-roadmap.docx
// Run from C:\Users\user\Quikfinance:
//   node docs/.generate-roadmap-docx.js

const path = require("path");
const fs = require("fs");
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
  PageBreak,
} = require(docxPath);

const CONTENT_WIDTH = 9360;
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

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

function P(text, opts = {}) {
  const runs = Array.isArray(text)
    ? text
    : typeof text === "string"
    ? makeRuns(text)
    : [new TextRun({ text: String(text), font: "Arial" })];
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
      new TextRun({ text, bold: true, size: 38, color: "1F2937", font: "Arial" }),
    ],
    spacing: { before: 400, after: 200 },
  });
}

function H2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [
      new TextRun({ text, bold: true, size: 30, color: "374151", font: "Arial" }),
    ],
    spacing: { before: 320, after: 160 },
  });
}

function H3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    children: [
      new TextRun({ text, bold: true, size: 24, color: "4B5563", font: "Arial" }),
    ],
    spacing: { before: 240, after: 120 },
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

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function blank() {
  return new Paragraph({ children: [new TextRun({ text: "" })] });
}

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
                  }),
                ],
              })
          ),
        })
    ),
  });
}

// ───── Build body ─────
const body = [];

// COVER
body.push(H1("Quikfinance — Roadmap"));
body.push(P("Remaining work in Banking, Accountant, and Reports modules + plan to merge Quikfinance into Quikit."));
body.push(blank());
body.push(P([new TextRun({ text: "Status: ", bold: true, font: "Arial" }), new TextRun({ text: "Roadmap / planning doc. No code changes yet.", font: "Arial" })]));
body.push(P([new TextRun({ text: "Author: ", bold: true, font: "Arial" }), new TextRun({ text: "Claude + Rishabh", font: "Arial" })]));
body.push(P([new TextRun({ text: "Date: ", bold: true, font: "Arial" }), new TextRun({ text: "2026-05-12", font: "Arial" })]));
body.push(P([new TextRun({ text: "Audience: ", bold: true, font: "Arial" }), new TextRun({ text: "Engineering / product / stakeholders deciding what to build next.", font: "Arial" })]));

// TLDR
body.push(H2("TL;DR"));
body.push(P("Three modules need work to reach production parity, and one big integration question remains:"));
body.push(blank());
body.push(buildTable(
  [
    ["Workstream", "Current state", "Remaining scope", "Effort"],
    ["Banking", "6 sub-pages built (Accounts, Transactions, Transfers, Card Payments, Owner Drawings, Other Income) — all create + list flows", "Bank feeds, reconciliation, CSV/OFX import, rules engine, multi-currency", "~4–6 weeks"],
    ["Accountant", "Chart of Accounts + Manual Journals + Journal Entries scaffolded", "Trial Balance, General Ledger drill-down, Period locking, Year-end close, Recurring journals, Fixed Assets, Budgets", "~4–6 weeks"],
    ["Reports", "8 reports live (P&L, BS, CF, AR/AP Aging, Sales/Tax Summary, GSTR-1, Stock Valuation)", "GSTR-3B, GSTR-2A recon, TDS forms, customer/vendor statements, custom report builder, Excel export, scheduled reports", "~3–4 weeks"],
    ["Quikit merge", "Quikit + Quikfinance on separate Vercel domains, separate auths", "SSO redirect (Phase 1) → optional iframe/proxy embed (Phase 2)", "~2 weeks for Phase 1"],
  ],
  [1500, 2500, 3360, 2000]
));
body.push(blank());
body.push(P([new TextRun({ text: "Total to finish: ", bold: true, font: "Arial" }), new TextRun({ text: "~13–18 weeks (3–4 calendar months) for one full-time engineer.", font: "Arial" })]));

// PART 1 — BANKING
body.push(pageBreak());
body.push(H1("Part 1 — Banking module"));

body.push(H2("What's shipped today"));
body.push(buildTable(
  [
    ["Route", "State", "Notes"],
    ["/banking", "✅ Tile landing", "Shows count of active accounts"],
    ["/banking/accounts", "✅ List + New", "Full CRUD for bank accounts (name, currency, opening balance, default flag)"],
    ["/banking/transactions", "✅ List + New", "Manual entry of debit/credit, account filter, ref / notes"],
    ["/banking/transfers", "✅ List + New", "Inter-account money movement (paired debit/credit)"],
    ["/banking/card-payments", "🟡 Stub", "Schema exists; UI is bare-bones — needs validation, categorization"],
    ["/banking/owner-drawings", "🟡 Stub", "Drawings as a special transaction kind; needs Owner Equity account auto-pairing"],
    ["/banking/other-income", "🟡 Stub", "Inverse of Owner Drawings — credits an Other Income account"],
  ],
  [2400, 1800, 5160]
));

body.push(H2("What's missing (priority-ordered)"));
body.push(H3("1. Bank feeds / statement upload (HIGH priority)"));
body.push(P("Real businesses need to import their bank statement instead of typing every transaction."));
body.push(bullet("CSV upload — let users upload a bank-statement CSV, map columns (Date / Description / Debit / Credit / Reference), preview, commit"));
body.push(bullet("OFX / QIF / MT940 parsers — Indian and US banks all export at least one of these"));
body.push(bullet("PDF statement OCR — Indian banks email PDF statements; OCR via Textract or Google Cloud Vision"));
body.push(bullet("API-based bank feeds — Plaid (US), Yodlee, ICICI Connected Banking, HDFC API, Axis API. Each is a separate integration"));
body.push(P([new TextRun({ text: "Suggested first PR: ", bold: true, font: "Arial" }), new TextRun({ text: "CSV upload only. Reuse the import-wizard pattern from lib/purchases/import-helpers.ts. ~1 week.", font: "Arial" })]));

body.push(H3("2. Bank reconciliation workflow (HIGH priority)"));
body.push(P("Match imported bank transactions against existing invoices, bills, and payment records."));
body.push(bullet("Reconcile page — left column: unmatched bank transactions. Right column: open invoices/bills with same vendor/customer + similar amount. One-click match"));
body.push(bullet("Bulk auto-match — exact amount + reference matches auto-confirm"));
body.push(bullet("Discrepancy report — closing bank balance vs Quikfinance's recorded balance"));
body.push(bullet("Reconcile-period locking — once a month is reconciled, lock those transactions from edits"));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~1.5 weeks. Schema is mostly ready — BankTransaction already has nullable FKs to Invoice / Bill / PaymentReceived / PaymentMade.", font: "Arial" })]));

body.push(H3("3. Rules engine for auto-categorization (MEDIUM priority)"));
body.push(P("Recurring transactions (Netflix, AWS, Rent) should auto-categorize without manual touch."));
body.push(bullet("Rule shape: IF description CONTAINS \"AWS\" → categorize as Software Expense, account = 6100"));
body.push(bullet("Apply on import — every uploaded transaction passes through user's rules first"));
body.push(bullet("Suggested rules — after 3 manual same-vendor categorizations, propose a rule"));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~1 week. New BankRule model + a small UI.", font: "Arial" })]));

body.push(H3("4. Multi-currency bank accounts (MEDIUM priority)"));
body.push(P("USD account showing a USD balance, INR home-currency P&L. Currently BankAccount.currency exists but exchange-rate booking isn't wired."));
body.push(bullet("Per-transaction FX rate — store both amounts (USD + INR equivalent at txn date)"));
body.push(bullet("Realized/unrealized gain-loss — month-end FX revaluation journal"));
body.push(bullet("FX rate source — ECB / RBI feed, or manual"));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~1.5 weeks. Needs CurrencyRate model + cron to refresh daily.", font: "Arial" })]));

body.push(H3("5. Card statement upload (LOW priority)"));
body.push(P("Same shape as bank statements but on credit-card side. Reuses CSV-upload work."));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~3 days once #1 lands.", font: "Arial" })]));

body.push(H2("Banking module — suggested PR breakdown"));
body.push(buildTable(
  [
    ["PR", "Scope", "Effort"],
    ["BNK-1", "CSV upload + column mapping + preview + commit", "1 week"],
    ["BNK-2", "Reconciliation page (manual match)", "1 week"],
    ["BNK-3", "Auto-match on exact amount + date", "3 days"],
    ["BNK-4", "Categorization rules (CRUD + apply-on-import)", "1 week"],
    ["BNK-5", "Multi-currency support + FX rate cron", "1.5 weeks"],
    ["BNK-6", "OFX/QIF parser + PDF OCR (optional)", "1 week"],
    ["BNK-7", "Card-payment statement upload", "3 days"],
  ],
  [1200, 6160, 2000]
));
body.push(P([new TextRun({ text: "Total: ~5–6 weeks.", bold: true, font: "Arial" })]));

// PART 2 — ACCOUNTANT
body.push(pageBreak());
body.push(H1("Part 2 — Accountant module"));

body.push(H2("What's shipped today"));
body.push(buildTable(
  [
    ["Route", "State", "Notes"],
    ["/accountant", "✅ Tile landing", "Shows account count + manual journal count"],
    ["/accountant/chart-of-accounts", "✅ List + New", "Code, name, type, active flag"],
    ["/accountant/manual-journals", "✅ List + New", "Free-form debit/credit lines with reference + notes"],
    ["/accountant/journal-entries", "🟡 Stub", "List exists; new form is bare-bones; auto-generated entries from invoices/bills not displayed"],
  ],
  [2800, 1700, 4860]
));

body.push(H2("What's missing (priority-ordered)"));

body.push(H3("1. Trial Balance (HIGH priority)"));
body.push(P("Every accountant's bread-and-butter. Lists every GL account with debit and credit totals for a date range."));
body.push(bullet("Page at /accountant/trial-balance (or /reports/trial-balance)"));
body.push(bullet("Drill-down — click an account → general-ledger view of every transaction"));
body.push(bullet("Period selector — month-to-date, quarter, fiscal year, custom range"));
body.push(bullet("Export to Excel + PDF"));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~3 days. Query is straightforward (SUM amount GROUP BY accountId).", font: "Arial" })]));

body.push(H3("2. General Ledger viewer (HIGH priority)"));
body.push(P("Drill-down view showing every transaction touching a specific GL account."));
body.push(bullet("Page at /accountant/general-ledger/[accountId] or as Trial-Balance drill-through"));
body.push(bullet("Filters — date range, debit-only / credit-only, search by reference"));
body.push(bullet("Running balance column — chronological balance after each transaction"));
body.push(bullet("Export"));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~3 days. Reuse existing JournalEntryLine query pattern.", font: "Arial" })]));

body.push(H3("3. Period locking + fiscal year close (HIGH priority)"));
body.push(P("Once an accountant signs off on a month/year, no one should be able to edit transactions in that period."));
body.push(bullet("FinancialPeriod model — start, end, status (Open/Closed/Locked), closedBy, closedAt"));
body.push(bullet("Middleware on mutations — Bill / Invoice / Payment / Journal save actions check the date and reject if it falls in a Closed period"));
body.push(bullet("Year-end close wizard — auto-generates closing entries (Income/Expense → Retained Earnings)"));
body.push(bullet("Unlock action — admin-only, audit-logged"));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~1 week. Touches every transaction action layer.", font: "Arial" })]));

body.push(H3("4. Recurring journals (MEDIUM priority)"));
body.push(P("Monthly depreciation entries, prepayment amortizations, accruals — all repeat. Reuse the Recurring Bills pattern."));
body.push(bullet("RecurringJournal model mirroring RecurringBill"));
body.push(bullet("Cron at /api/cron/recurring-journals (add to vercel.json)"));
body.push(bullet("CRUD UI at /accountant/recurring-journals"));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~1 week. Clone the Recurring Bills shape from lib/purchases/recurring.ts.", font: "Arial" })]));

body.push(H3("5. Fixed Assets register (MEDIUM priority)"));
body.push(P("Track depreciable assets — laptops, vehicles, furniture — with automatic monthly depreciation journals."));
body.push(bullet("FixedAsset model — purchase date, cost, life, depreciation method (SL/WDV), salvage"));
body.push(bullet("Page at /accountant/fixed-assets — list with current book value + accumulated depreciation"));
body.push(bullet("Auto-depreciation cron — monthly journal posting"));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~1 week.", font: "Arial" })]));

body.push(H3("6. Budgets & variance (LOW priority)"));
body.push(P("Set a budget per account per month → compare to actuals."));
body.push(bullet("Budget model — accountId, period, amount"));
body.push(bullet("Variance report at /reports/budget-vs-actual"));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~4 days.", font: "Arial" })]));

body.push(H3("7. Accountant-role permissions (LOW priority)"));
body.push(P("Zoho-style \"Accountant\" role — read everything, write journals + Chart of Accounts, no access to settings/users/billing."));
body.push(bullet("Add ACCOUNTANT enum to OrganizationMembership.role"));
body.push(bullet("requireAccountant() helper alongside requireOrganization()"));
body.push(bullet("Settings page that lists members + role chips"));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~3 days. Mostly auth-helper plumbing.", font: "Arial" })]));

body.push(H2("Accountant module — suggested PR breakdown"));
body.push(buildTable(
  [
    ["PR", "Scope", "Effort"],
    ["ACC-1", "Trial Balance page + drill-down", "3 days"],
    ["ACC-2", "General Ledger viewer", "3 days"],
    ["ACC-3", "Period locking infrastructure", "1 week"],
    ["ACC-4", "Year-end close wizard", "4 days"],
    ["ACC-5", "Recurring journals", "1 week"],
    ["ACC-6", "Fixed Assets register + depreciation cron", "1 week"],
    ["ACC-7", "Budgets + variance report", "4 days"],
    ["ACC-8", "Accountant role + permissions", "3 days"],
  ],
  [1200, 6160, 2000]
));
body.push(P([new TextRun({ text: "Total: ~5–6 weeks.", bold: true, font: "Arial" })]));

// PART 3 — REPORTS
body.push(pageBreak());
body.push(H1("Part 3 — Reports module"));

body.push(H2("What's shipped today"));
body.push(buildTable(
  [
    ["Report", "Route", "State"],
    ["Profit & Loss", "/reports/profit-loss", "✅"],
    ["Balance Sheet", "/reports/balance-sheet", "✅"],
    ["Cash Flow (with chart)", "/reports/cash-flow", "✅"],
    ["Receivables Aging (AR)", "/reports/ar-aging", "✅"],
    ["Payables Aging (AP)", "/reports/ap-aging", "✅"],
    ["Sales Summary", "/reports/sales-summary", "✅"],
    ["Tax Summary", "/reports/tax-summary", "✅"],
    ["GSTR-1 Export", "/reports/gstr1", "✅"],
    ["Stock Valuation", "/reports/stock-valuation", "✅"],
  ],
  [3200, 3960, 2200]
));

body.push(H2("What's missing (priority-ordered)"));

body.push(H3("1. GSTR-3B export (HIGH — India compliance)"));
body.push(P("Monthly summary return — every GST-registered business in India must file this."));
body.push(bullet("Page at /reports/gstr3b"));
body.push(bullet("Auto-compute outward supplies, inward supplies, ITC claims, net liability"));
body.push(bullet("JSON + PDF download matching GSTN portal format"));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~1 week. Reuses GSTR-1 computation primitives.", font: "Arial" })]));

body.push(H3("2. GSTR-2A / 2B reconciliation (HIGH — India compliance)"));
body.push(P("Match purchase invoices against ITC available in the GSTN portal — flag missing/mismatched bills."));
body.push(bullet("Upload GSTR-2A JSON from the portal"));
body.push(bullet("Match against Quikfinance bills by GSTIN + invoice number + amount"));
body.push(bullet("Mismatch report — bills you've booked but seller hasn't filed, OR seller has filed but you haven't booked"));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~1.5 weeks.", font: "Arial" })]));

body.push(H3("3. Trial Balance + General Ledger reports (MEDIUM)"));
body.push(P("Already listed under Accountant module. Whichever ships first wins — list-based reports + drill-down."));

body.push(H3("4. TDS reports / Form 24Q + 26Q (HIGH — India compliance)"));
body.push(P("TDS deducted on payments to vendors → quarterly Form 26Q export."));
body.push(bullet("TdsDeduction aggregate — already captured per Payment Made"));
body.push(bullet("Quarterly Form 26Q export — TXT / FVU format"));
body.push(bullet("TDS certificate (Form 16A) — PDF generator"));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~1.5 weeks.", font: "Arial" })]));

body.push(H3("5. Customer & Vendor statements (MEDIUM priority)"));
body.push(P("Per-customer or per-vendor PDF report showing every transaction + running balance for a date range."));
body.push(bullet("/reports/customer-statements/[id] with date picker + email-to-customer button"));
body.push(bullet("/reports/vendor-statements/[id] mirror"));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~4 days.", font: "Arial" })]));

body.push(H3("6. Inventory aging (LOW priority)"));
body.push(P("For each item, how long has it been in stock? Identifies slow-moving inventory."));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~3 days.", font: "Arial" })]));

body.push(H3("7. Sales by Customer / Item / Region (LOW priority)"));
body.push(P("Drill-down summaries already in Sales Summary, but full report views with filters + export."));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~4 days.", font: "Arial" })]));

body.push(H3("8. Custom report builder (LOW priority — high payoff)"));
body.push(P("\"Pick fields → group by → filter → save view.\" Zoho/Tally don't do this well; could be a differentiator."));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~3 weeks. Big project.", font: "Arial" })]));

body.push(H3("9. Excel export + scheduled email (MEDIUM — across all reports)"));
body.push(P("Every existing report should have an \"Export to Excel\" button. Plus: schedule a report to email every 1st of the month."));
body.push(bullet("exceljs library for Excel generation"));
body.push(bullet("/api/cron/scheduled-reports daily, checks ReportSchedule table"));
body.push(P([new TextRun({ text: "Effort: ", bold: true, font: "Arial" }), new TextRun({ text: "~1 week.", font: "Arial" })]));

body.push(H2("Reports module — suggested PR breakdown"));
body.push(buildTable(
  [
    ["PR", "Scope", "Effort"],
    ["RPT-1", "GSTR-3B export", "1 week"],
    ["RPT-2", "GSTR-2A reconciliation", "1.5 weeks"],
    ["RPT-3", "TDS Form 26Q + Form 16A", "1.5 weeks"],
    ["RPT-4", "Customer & Vendor statements", "4 days"],
    ["RPT-5", "Excel export across all reports", "4 days"],
    ["RPT-6", "Scheduled-reports cron + email", "3 days"],
    ["RPT-7", "Inventory aging", "3 days"],
    ["RPT-8", "Sales drill-downs", "4 days"],
    ["RPT-9", "Custom report builder (defer / separate sprint)", "3 weeks"],
  ],
  [1200, 6160, 2000]
));
body.push(P([new TextRun({ text: "Total: ~3–4 weeks (excluding the custom builder).", bold: true, font: "Arial" })]));

// PART 4 — QUIKIT
body.push(pageBreak());
body.push(H1("Part 4 — Quikit Integration"));
body.push(P("(Condensed from docs/quikit-integration.md — full version in that file + matching .docx.)"));

body.push(H2("Goal"));
body.push(P("Surface Quikfinance as an app inside the Quikit platform at https://quik-it-auth.vercel.app/apps. Users sign into Quikit once and reach Quikfinance from the app launcher."));

body.push(H2("Four ways to merge — and the recommendation"));
body.push(buildTable(
  [
    ["Option", "What user sees", "Effort", "Recommendation"],
    ["A. SSO redirect", "Click Quikfinance tile in Quikit /apps → hops to quikfinance.vercel.app already signed in. Two URLs, one identity.", "1–2 weeks", "✅ Start here"],
    ["B. Iframe embed", "Quikfinance renders inside Quikit's chrome at quikit.com/apps/quikfinance. One URL bar.", "+1 week on top of A", "🟡 Only if unified UI is non-negotiable"],
    ["C. Reverse-proxy mount", "Same single-URL feel via Vercel rewrites.", "3–4 weeks", "🟡 Sneakily complex"],
    ["D. Full code merge", "One repo, one DB, one product.", "2–3 months", "❌ Only if consolidating products"],
  ],
  [1700, 3360, 1700, 2600]
));

body.push(H2("Option A — SSO redirect (Phase 1, recommended)"));

body.push(H3("Flow"));
body.push(numbered("User logs into Quikit at auth-quikit.vercel.app"));
body.push(numbered("Lands on Quikit's /apps page"));
body.push(numbered("Clicks the Quikfinance tile"));
body.push(numbered("Quikit generates a short-lived signed JWT (5-min exp): { sub, email, name, tenantId }"));
body.push(numbered("Browser redirects to https://quikfinance-software.vercel.app/api/auth/sso?token=<jwt>"));
body.push(numbered("Quikfinance verifies the JWT, upserts user + organization, sets a NextAuth session cookie, redirects to /"));
body.push(numbered("User lands on Quikfinance dashboard, authenticated"));

body.push(H3("Quikfinance-side changes (~470 LOC new code)"));
body.push(buildTable(
  [
    ["File", "Change"],
    ["app/api/auth/sso/route.ts", "NEW — GET handler verifies JWT, upserts user/org via Prisma, signs in via NextAuth credentials provider, redirects to /"],
    ["lib/auth.ts", "Add second Credentials provider with id quikit-sso"],
    ["lib/quikit-sso.ts", "NEW — JWT verification + user-provisioning helper"],
    [".env.example", "Add QUIKIT_SSO_ISSUER, QUIKIT_SSO_AUDIENCE, QUIKIT_SSO_SECRET (HS256)"],
    ["prisma/schema.prisma", "Add User.quikitId + Organization.quikitTenantId (unique)"],
    ["middleware.ts", "Allow-list /api/auth/sso in PUBLIC_PATHS"],
    ["tests/unit/sso.test.ts + tests/e2e/quikit-sso.spec.ts", "New test coverage"],
  ],
  [3000, 6360]
));

body.push(H3("Quikit-side changes"));
body.push(buildTable(
  [
    ["File", "Change"],
    ["Apps registry", "Add Quikfinance tile: { id: 'quikfinance', name: 'Quikfinance', launchUrl: '/api/launch/quikfinance' }"],
    ["app/api/launch/quikfinance/route.ts", "NEW — mints JWT, redirects to Quikfinance"],
    ["Env var", "QUIKFINANCE_SSO_SECRET (matches Quikfinance's value)"],
  ],
  [3000, 6360]
));

body.push(H3("Security checklist"));
body.push(bullet("JWT TTL ≤ 5 minutes"));
body.push(bullet("Audience claim enforced (token for one app can't unlock another)"));
body.push(bullet("One-time jti tracked ~10 min to defeat replay"));
body.push(bullet("Shared secret stored as encrypted env on Vercel both sides"));
body.push(bullet("Audit log writes SsoSignIn per exchange"));
body.push(bullet("No JWT logged anywhere (Sentry breadcrumb filter)"));

body.push(H3("Effort breakdown"));
body.push(buildTable(
  [
    ["Task", "Days"],
    ["Quikit-side launch endpoint", "2"],
    ["Quikfinance /api/auth/sso + JWT verifier + provisioning", "3"],
    ["Unit + Playwright tests", "2"],
    ["Docs + DECISIONS update", "0.5"],
    ["End-to-end manual smoke + bugfixes", "1.5"],
    ["Total", "~9 working days (~2 weeks calendar)"],
  ],
  [6000, 3360]
));

body.push(H2("Phased rollout"));
body.push(buildTable(
  [
    ["Phase", "Scope", "Outcome"],
    ["Phase 1 (week 1–2)", "Option A — SSO redirect", "Quikfinance tile in Quikit /apps clicks through to live app. Two URLs, one identity."],
    ["Phase 2a (week 3–4, optional)", "Layer Option B (iframe) on top", "Quikfinance renders inside Quikit's chrome. One URL bar."],
    ["Phase 2b (week 5+, alternative)", "Option C — reverse proxy", "Same single-URL feel via Vercel rewrites. Bigger lift."],
    ["Phase 3 (future)", "Data integration", "Quikit user directory ↔ Quikfinance Contact table; Quikit billing ↔ Quikfinance subscription state; unified audit log"],
  ],
  [2200, 2800, 4360]
));

body.push(H2("Open questions (need answers before Phase 1)"));
body.push(numbered("Who owns Quikit? If third-party, follow their dev docs. If you own both, you can dictate the contract."));
body.push(numbered("Does Quikit already have an SSO pattern for other apps? Follow it if yes."));
body.push(numbered("Tenant cardinality — one Quikit tenant per Quikfinance org, or many?"));
body.push(numbered("Sign-out propagation — sign out of Quikfinance kills only the Quikfinance session, or bubbles back to Quikit?"));
body.push(numbered("Provisioning flow — net-new Quikit user clicking the tile auto-gets a Quikfinance org with seed chart-of-accounts, or pre-provisioned?"));

body.push(H2("Risks + rollback"));
body.push(buildTable(
  [
    ["Risk", "Mitigation"],
    ["Shared SSO secret leaks", "Rotate via env update + redeploy; 5-min token TTL minimizes damage window"],
    ["Quikit auth changes break Quikfinance SSO", "Sentry alert on 4xx/5xx rate; Quikit-side regression tests"],
    ["User upserts create duplicate orgs", "Organization.quikitTenantId @unique enforces at DB level"],
    ["Quikfinance feature breaks in embedded mode (Razorpay, etc.)", "Phase 1 (Option A) avoids this — Quikfinance stays standalone"],
  ],
  [3600, 5760]
));
body.push(blank());
body.push(P([new TextRun({ text: "Rollback for Phase 1: ", bold: true, font: "Arial" }), new TextRun({ text: "Remove the Quikfinance tile from Quikit. Direct users back to quikfinance-software.vercel.app/login. No code revert needed beyond optionally disabling the SSO route via an env-var feature flag.", font: "Arial" })]));

// SEQUENCE
body.push(pageBreak());
body.push(H1("Suggested overall sequence"));
body.push(P("If a single full-time engineer picked this up tomorrow, the smart ordering is:"));
body.push(blank());
body.push(buildTable(
  [
    ["Order", "Workstream", "Why this order"],
    ["1", "Quikit SSO (Phase 1)", "2 weeks. Unlocks the user-visible \"Quikfinance is in Quikit\" win first. Smallest scope; biggest perception payoff."],
    ["2", "Banking — CSV upload + reconciliation", "3 weeks. Highest-impact missing feature for actual accounting users."],
    ["3", "Accountant — Trial Balance + General Ledger + Period locking", "2.5 weeks. Required for any serious finance team to trust the books."],
    ["4", "Reports — GSTR-3B + TDS forms + Customer/Vendor statements", "3 weeks. India compliance + day-to-day reporting basics."],
    ["5", "Banking — Rules engine + Multi-currency + Card statements", "2.5 weeks."],
    ["6", "Accountant — Recurring journals + Fixed Assets + Budgets", "2.5 weeks."],
    ["7", "Reports — GSTR-2A recon + Excel export + scheduled reports", "2 weeks."],
    ["8", "Quikit Phase 2 (iframe OR proxy)", "1–4 weeks depending on choice."],
    ["9", "Polish / spec niceties / Accountant role permissions", "1–2 weeks."],
    ["10", "Custom report builder (optional differentiator)", "3 weeks."],
  ],
  [800, 3600, 4960]
));
body.push(blank());
body.push(P([new TextRun({ text: "Grand total: ", bold: true, font: "Arial" }), new TextRun({ text: "~22–28 weeks of focused engineering (5–7 months for one engineer; 3–4 months for two).", font: "Arial" })]));

body.push(H2("Decisions you need to make before kickoff"));
body.push(numbered("Banking — bank-feed strategy. CSV-only forever, or invest in API integrations (Plaid for US, ICICI / HDFC / Axis Connected Banking for India)?"));
body.push(numbered("Accountant — period-locking strictness. Hard-block edits in closed periods (Tally / SAP style), or warn-then-allow (Zoho style)?"));
body.push(numbered("Reports — Indian-only vs multi-region. GSTR-3B / TDS forms only matter for Indian users. Do non-Indian customers exist?"));
body.push(numbered("Quikit merge — own both apps or third-party? Changes the entire integration approach."));
body.push(numbered("Resourcing. Solo developer for 6 months, or scale to 2-3 engineers and finish in 3-4 months?"));
body.push(blank());
body.push(P([new TextRun({ text: "Once these five are answered, the workstreams above can run in parallel and the timeline compresses.", italics: true, font: "Arial" })]));

// ───── Build document ─────
const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 38, bold: true, font: "Arial", color: "1F2937" },
        paragraph: { spacing: { before: 400, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: "374151" },
        paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "4B5563" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [
          { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
          { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 1440, hanging: 360 } } } },
        ] },
      { reference: "numbers",
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        ] },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({
            text: "Quikfinance · Roadmap · Banking + Accountant + Reports + Quikit",
            font: "Arial", size: 18, color: "9CA3AF",
          })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [
            new TextRun({ text: "Page ", font: "Arial", size: 18, color: "9CA3AF" }),
            new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "9CA3AF" }),
            new TextRun({ text: " of ", font: "Arial", size: 18, color: "9CA3AF" }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 18, color: "9CA3AF" }),
          ],
        })],
      }),
    },
    children: body,
  }],
});

const outPath = path.join(__dirname, "quikfinance-roadmap.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log(`wrote ${outPath} (${buf.length} bytes)`);
});
