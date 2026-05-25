/* eslint-disable */
// Generator: docs/zoho-banking-research.md  ->  docs/zoho-banking-research.docx
// Run from C:\Users\user\Quikfinance:
//   node docs/.generate-zoho-banking-docx.js

const path = require("path");
const fs = require("fs");
const docxPath = path.join(__dirname, "..", "node_modules", "docx");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, PageNumber, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageBreak,
} = require(docxPath);

const CONTENT_WIDTH = 9360;
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "BFBFBF" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function makeRuns(text) {
  if (typeof text !== "string") return text;
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return parts.map((p) => {
    if (p.startsWith("**") && p.endsWith("**"))
      return new TextRun({ text: p.slice(2, -2), bold: true, font: "Arial" });
    if (p.startsWith("`") && p.endsWith("`"))
      return new TextRun({ text: p.slice(1, -1), font: "Consolas", size: 20,
        shading: { type: ShadingType.CLEAR, fill: "F3F4F6" } });
    return new TextRun({ text: p, font: "Arial" });
  });
}

const P = (text) => new Paragraph({ children: typeof text === "string" ? makeRuns(text) : (Array.isArray(text) ? text : [new TextRun({ text: String(text), font: "Arial" })]), spacing: { after: 120 } });
const H1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text, bold: true, size: 38, color: "1F2937", font: "Arial" })], spacing: { before: 400, after: 200 } });
const H2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text, bold: true, size: 30, color: "374151", font: "Arial" })], spacing: { before: 320, after: 160 } });
const H3 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun({ text, bold: true, size: 24, color: "4B5563", font: "Arial" })], spacing: { before: 240, after: 120 } });
const bullet = (text, level = 0) => new Paragraph({ numbering: { reference: "bullets", level }, children: makeRuns(text), spacing: { after: 60 } });
const numbered = (text, level = 0) => new Paragraph({ numbering: { reference: "numbers", level }, children: makeRuns(text), spacing: { after: 60 } });
const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
const blank = () => new Paragraph({ children: [new TextRun({ text: "" })] });
const code = (text) => new Paragraph({ children: [new TextRun({ text, font: "Consolas", size: 18 })], shading: { type: ShadingType.CLEAR, fill: "F3F4F6" }, spacing: { after: 120 } });

function buildTable(rows, colWidthsRaw) {
  const colCount = rows[0].length;
  const colWidths = colWidthsRaw && colWidthsRaw.length === colCount ? colWidthsRaw : Array(colCount).fill(Math.floor(CONTENT_WIDTH / colCount));
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: rows.map((row, ri) => new TableRow({
      children: row.map((cell, ci) => new TableCell({
        borders: BORDERS,
        width: { size: colWidths[ci], type: WidthType.DXA },
        shading: ri === 0 ? { type: ShadingType.CLEAR, fill: "DCEAFA" } : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: makeRuns(cell), spacing: { after: 0 } })],
      })),
    })),
  });
}

const body = [];

// COVER
body.push(H1("Zoho Books Banking — Module Research"));
body.push(P("Comprehensive teardown of Zoho's Banking module + gap analysis against Quikfinance, with build-order recommendation."));
body.push(blank());
body.push(P([new TextRun({ text: "Status: ", bold: true, font: "Arial" }), new TextRun({ text: "Research / specification doc. No code changes yet.", font: "Arial" })]));
body.push(P([new TextRun({ text: "Author: ", bold: true, font: "Arial" }), new TextRun({ text: "Claude + Rishabh", font: "Arial" })]));
body.push(P([new TextRun({ text: "Date: ", bold: true, font: "Arial" }), new TextRun({ text: "2026-05-12 (rev. with screenshot-driven updates)", font: "Arial" })]));
body.push(P([new TextRun({ text: "Source material: ", bold: true, font: "Arial" }), new TextRun({ text: "Zoho Books public help docs + screenshots from Rishabh's live tenant (Banking landing page + Connect Bank modal). Sections marked 📸 are confirmed by screenshots; the rest is inferred from public docs.", font: "Arial" })]));

// TLDR
body.push(H2("TL;DR — Zoho's Banking module has 9 sub-modules"));
body.push(code("Banking"));
body.push(code("├── 1. Add Bank or Credit Card     (auto-feeds via Yodlee/Token + manual)"));
body.push(code("├── 2. Bank Feeds                  (24h sync, MFA handling, deactivate, refresh)"));
body.push(code("├── 3. Bank Accounts list          (the bankslist page in the URL you sent)"));
body.push(code("│   └── per-account Dashboard      (Latest Statement Details — 6 metrics)"));
body.push(code("├── 4. Add Transaction             (manual Money In / Money Out)"));
body.push(code("├── 5. Import Bank Statement       (CSV / TSV / OFX / QIF / CAMT.053 / PDF)"));
body.push(code("├── 6. Match Transactions          (bank line ↔ Quikfinance record)"));
body.push(code("├── 7. Transaction Rules           (auto-categorization on incoming feeds)"));
body.push(code("├── 8. Reconciliation              (closing balance ↔ cleared total)"));
body.push(code("└── 9. Record Deposit              (cash account → bank account transfer)"));
body.push(blank());
body.push(P([new TextRun({ text: "The URL you sent (", font: "Arial" }), new TextRun({ text: "/banking/feeds/bankslist", font: "Consolas", size: 20 }), new TextRun({ text: ") is sub-module #3 — the master list of all your bank + credit-card + PayPal accounts.", font: "Arial" })]));
body.push(P("Quikfinance currently has rough analogues of #1, #3 (partial), and #4. Everything else is missing."));

// 1
body.push(pageBreak());
body.push(H1("1. Add Bank or Credit Card"));

// 📸 Three-tier model (confirmed from screenshot)
body.push(H2("📸 The three-tier integration model (confirmed from screenshot)"));
body.push(P("The Connect Bank / Credit Card modal in the live tenant shows three distinct integration tiers, not two:"));
body.push(buildTable([
  ["Tier", "Banner label in modal", "Banks shown", "How it works"],
  ["A. Direct Partner-Bank APIs", "Partner Banks Fetch feeds directly — 5 large bank logos at the top of the modal", "Standard Chartered, HSBC, Kotak Mahindra Bank, SBI, Axis Bank", "Zoho has direct API contracts with each bank. Bypasses any third-party aggregator. Best UX: real-time sync, no MFA dance, multi-day backfill."],
  ["B. Third-Party Feed Aggregator (Yodlee / Token)", "Automatic Bank Feeds Supported Banks — 9 bank/service cards + Connect Now CTA", "PayPal, ICICI, HDFC, SBI, Kotak, Axis (banking accounts) + HDFC Credit Card, SBI Credit Cards, American Express Cards", "Goes through Yodlee's OAuth-like flow. 24h auto-sync; MFA banks require manual refresh once/day."],
  ["C. Manual fallback", "Add bank or credit card account manually — single section with Add Account CTA", "Any bank not in tiers A or B", "User fills out account fields by hand. No auto-sync; user is responsible for statement upload."],
], [1800, 2600, 2400, 2560]));
body.push(blank());
body.push(P([new TextRun({ text: "Interesting overlap: ", bold: true, font: "Arial" }), new TextRun({ text: "HDFC, SBI, Kotak, Axis appear in BOTH tier A (as partner-bank logos) AND tier B (as feed-supported cards). Zoho lets a Kotak user pick either the direct partner path (best UX) or the Yodlee fallback (if direct is misbehaving). Real-world resilience pattern.", font: "Arial" })]));

body.push(H3("Credit cards are a separate \"account\" type — same bank counted twice"));
body.push(P("In tier B, \"HDFC Bank (India)\" and \"HDFC Bank (India) - Credit Card\" appear as two distinct cards (the credit card variant has a \"C\" badge with the legend \"C → Credit Card\" at the bottom). Same for SBI: \"State Bank of India (India) - Banking\" + \"State Bank of India Credit Cards (India)\". And \"American Express Cards (India)\" is credit-card-only."));

body.push(H3("📸 Add-Account form field-shape (confirmed from Screenshots 3 + 4)"));
body.push(P("The manual \"Add Bank or Credit Card\" form re-renders dynamically when the user toggles the Account Type radio. Field deltas:"));
body.push(buildTable([
  ["Field", "Bank", "Credit Card", "Notes"],
  ["Select Account Type *", "✓", "✓", "Radio: Bank / Credit Card"],
  ["Account Name *", "✓", "✓", "Required, focused on load"],
  ["Account Code", "✓", "✓", "Optional"],
  ["Currency *", "✓", "✓", "Defaults to INR"],
  ["Account Number", "✓", "—", "Bank only"],
  ["Bank Name", "✓", "✓", "Optional"],
  ["IFSC", "✓", "—", "Bank only"],
  ["Description", "✓", "✓", "Max 500 chars textarea"],
  ["Make this primary", "✓", "—", "Bank only; only one BANK can be primary per org"],
], [2000, 900, 1400, 5060]));
body.push(blank());
body.push(P([new TextRun({ text: "Important: ", bold: true, font: "Arial" }), new TextRun({ text: "The credit-card form is dramatically simpler than I had initially assumed. Zoho does NOT collect statement cycle date, credit limit, or card-last-4 at creation. Either they're captured later in account settings, or simply not modelled. For Quikfinance v1 we should match this minimalism — defer credit-card-specific fields until a real customer asks. YAGNI.", font: "Arial" })]));

body.push(H3("Revised data-model sketch (post-screenshot)"));
body.push(code("// Common fields (all types):"));
body.push(code("{"));
body.push(code("  type: 'BANK' | 'CREDIT_CARD' | 'PAYPAL'"));
body.push(code("  accountName: string         // required"));
body.push(code("  accountCode?: string"));
body.push(code("  currency: string            // required, default 'INR'"));
body.push(code("  bankName?: string"));
body.push(code("  description?: string        // max 500 chars"));
body.push(code("}"));
body.push(code(""));
body.push(code("// Bank-only extra fields:"));
body.push(code("{"));
body.push(code("  accountNumber?: string"));
body.push(code("  ifsc?: string"));
body.push(code("  isPrimary?: boolean         // only one BANK can be primary per org"));
body.push(code("}"));
body.push(code(""));
body.push(code("// Credit Card: no extra fields at creation time"));
body.push(code("// PayPal: not visible from screenshots — probably email + multi-currency picker"));
body.push(P("Credit cards reverse balance polarity (a positive balance means you owe the bank). That's a reporting / GL concern, not a creation-form concern."));

// 📸 Empty-state UX (confirmed from screenshot)
body.push(H2("📸 Banking landing page (empty state) — confirmed from screenshot"));
body.push(P("When no banks are connected, the user lands on a page with this exact shape:"));
body.push(code("                Stay on top of your money"));
body.push(code(""));
body.push(code("Connect your bank and credit cards to fetch all your transactions."));
body.push(code("Create, categorize and match these transactions to those you have"));
body.push(code("in Zoho Books."));
body.push(code(""));
body.push(code("         [ Connect Bank / Credit Card ]  [ Add Manually ]"));
body.push(code(""));
body.push(code("           Don't use banking for your business? Skip"));
body.push(code(""));
body.push(code("      ▶ Watch how to connect your bank account to Zoho Books"));
body.push(blank());
body.push(P("UI elements:"));
body.push(bullet("Headline: \"Stay on top of your money\" — single-line, centered"));
body.push(bullet("Sub-copy: two-line description"));
body.push(bullet("Primary CTA: \"Connect Bank / Credit Card\" — blue, prominent (opens the three-tier modal)"));
body.push(bullet("Secondary CTA: \"Add Manually\" — outlined button (skips modal, goes straight to tier-C manual entry)"));
body.push(bullet("Skip link: \"Don't use banking for your business? Skip\" — hides the module per-user"));
body.push(bullet("Tutorial link: play-icon + \"Watch how to connect your bank account to Zoho Books\""));
body.push(P([new TextRun({ text: "Implication for Quikfinance: ", bold: true, font: "Arial" }), new TextRun({ text: "BNK-A's empty state should mirror this. Quikfinance's existing /banking page is a tile-grid dashboard — that's the non-empty state. When zero BankAccount rows exist, swap to this empty-state pattern. ~half a day of work, big visual payoff.", font: "Arial" })]));

body.push(H2("Three providers, two paths (legacy section kept for diff continuity)"));

body.push(H3("Path A — Automatic Bank Feeds (Yodlee / Token)"));
body.push(P("User clicks + Add Bank or Credit Card → picks bank from a search list → flow:"));
body.push(numbered("Select a Bank Feeds Service Provider (Yodlee in most regions, Token for some)"));
body.push(numbered("Agree to end-user terms for automatic feeds (compliance — required by Yodlee)"));
body.push(numbered("Enter bank login credentials (via Yodlee-hosted iframe / OAuth handoff)"));
body.push(numbered("Choose which account from the bank to connect"));
body.push(numbered("Choose a start date for transaction history (max 90 days of backfill)"));
body.push(P("After completion, Zoho fetches transactions every 24 hours automatically if the bank doesn't require MFA. With MFA, manual refresh only (rate-limited to once/day)."));

body.push(H3("Path B — Manual Account (unsupported bank)"));
body.push(P("User clicks Add Account instead. Fields:"));
body.push(buildTable([
  ["Field", "Required", "Notes"],
  ["Account Type", "yes", "Bank / Credit Card"],
  ["Account Name", "yes", "Display name"],
  ["Account Code", "yes", "Unique short ID"],
  ["Currency", "yes", "Single currency at creation (multi-currency only for PayPal)"],
  ["Account Number", "bank only", "Optional for Credit Card"],
  ["Bank Name", "yes", ""],
  ["Bank Identifier Code", "bank only", "IFSC / IBAN / SWIFT"],
  ["Location", "optional", "If multi-location org"],
  ["Users", "optional", "Access control — which users can see this account"],
  ["Description", "optional", ""],
], [2200, 1500, 5660]));

body.push(H3("Path C — PayPal / Stripe (special)"));
body.push(P("Treated as a 'bank account' but with multi-currency baked in. Each currency PayPal supports becomes its own sub-feed inside one PayPal account."));

body.push(H2("Implications for Quikfinance (revised after screenshot review)"));
body.push(P("Quikfinance currently has /banking/accounts/new with a flat manual form only. To reach Zoho parity we need a three-version build plan:"));
body.push(buildTable([
  ["Version", "What ships", "Effort", "Unlocks"],
  ["v1 — Manual + CSV/OFX", "The empty-state UX + Add Manually form (BANK / CREDIT_CARD / PAYPAL types) + statement-upload wizard", "~1.5 weeks", "80% of tier-C functionality. Users get a working banking module without any external integration."],
  ["v2 — Yodlee tier-B feeds", "OAuth-style bank-picker modal + 24h sync cron + MFA refresh handling", "~3 weeks + Yodlee contract", "Full tier-B experience for India + US banks. Same UX as Zoho's Automatic Bank Feeds section."],
  ["v3 — Direct partner-bank APIs", "One-bank-at-a-time: start with ICICI Connected Banking (largest India share), then HDFC, Axis", "~2 weeks per bank", "Tier-A UX (real-time, no MFA dance). Differentiates Quikfinance against competitors who only have Yodlee."],
], [1700, 3600, 1600, 2460]));
body.push(blank());
body.push(P([new TextRun({ text: "Recommendation: ", bold: true, font: "Arial" }), new TextRun({ text: "Start with v1. The CSV/OFX import already has 90% of the value with 20% of the integration cost. v2 unlocks zero-friction onboarding once Yodlee is justified. v3 is a competitive moat once you have paying customers asking for specific banks.", font: "Arial" })]));
body.push(P([new TextRun({ text: "Bonus: ", bold: true, font: "Arial" }), new TextRun({ text: "the empty-state page is just CSS + a BankAccount.count() === 0 check in the existing /banking/page.tsx. That alone is 4 hours of work and the visual feels like progress immediately.", font: "Arial" })]));

// 2
body.push(pageBreak());
body.push(H1("2. Bank Feeds"));
body.push(H2("The auto-sync contract"));
body.push(buildTable([
  ["Behaviour", "Detail"],
  ["Frequency", "Every 24h for non-MFA banks"],
  ["MFA banks", "Manual refresh required; bank will not allow automatic feeds"],
  ["Rate limit", "Manual refresh: once per day per account"],
  ["Backend", "Yodlee primary; some regions use Token. Migration path to Yodlee's new API platform"],
], [2800, 6560]));

// 📸 Yodlee handoff (Screenshots 5 + 6)
body.push(H2("📸 The Yodlee handoff flow — confirmed from Screenshots 5 + 6"));
body.push(P("Clicking \"Connect Now\" on the tier-B section opens a 3-step in-modal flow:"));

body.push(H3("Step 1 — EULA acceptance gate"));
body.push(buildTable([
  ["UI element", "Value"],
  ["Modal title", "Connect and add your bank or credit card accounts"],
  ["Bank Feeds Service Provider", "Yodlee ▾ dropdown (Token is the documented alternative)"],
  ["Info banner", "The End User License Agreement (EULA) describes the terms..."],
  ["Required checkbox", "I have read and agree to all the end user terms for automatic bank feeds (link opens EULA)"],
  ["Buttons", "[Proceed] (disabled until checked) + [Cancel]"],
], [2800, 6560]));
body.push(blank());
body.push(P([new TextRun({ text: "Compliance significance: ", bold: true, font: "Arial" }), new TextRun({ text: "Zoho legally cannot pass user credentials to Yodlee without recorded consent. The Proceed button is grayed-out until the checkbox is ticked. Quikfinance v2 must mirror this exactly — no shortcut.", font: "Arial" })]));

body.push(H3("Step 2 — Bank picker (Yodlee's embedded UI)"));
body.push(P("After Proceed, the modal shows Yodlee's bank search:"));
body.push(bullet("Subtitle changes to: \"If you don't find the bank that you're trying to connect with Zoho Books, select another service provider and search for the bank you want to connect.\""));
body.push(bullet("Service Provider dropdown stays visible (lets user switch mid-flow if their bank isn't in Yodlee)"));
body.push(bullet("Countdown timer: \"ⓘ You have 29:36 time remaining to connect your bank\" — ~30 min session window"));
body.push(bullet("Centered search input"));
body.push(bullet("4-column tile grid of featured banks (regional — US tenants see Chase/Wells/BoA/Capital One/Chime/Navy Federal/Fidelity/USAA/Huntington; Indian tenants presumably see ICICI/HDFC/etc.)"));
body.push(bullet("Long bank names truncate with ellipsis (e.g. \"First Internet Bank of ...\", \"Huntington Bank (Per...\")"));
body.push(bullet("Small ✕ in the grid area to back out without losing EULA consent"));

body.push(H3("📸 Step 3 — Yodlee credential entry (confirmed from Screenshot 7)"));
body.push(P("The Yodlee FastLink iframe loads inside Zoho's modal. Outer Zoho chrome (provider dropdown + countdown timer) stays visible above the iframe."));
body.push(P("Inside the iframe (vertical layout):"));
body.push(buildTable([
  ["Element", "Detail"],
  ["Back arrow < (top-left)", "Returns to the bank picker — user can pick a different bank without losing EULA consent"],
  ["Close ✕ (top-right)", "Cancels the entire credential flow"],
  ["Bank logo", "Large, fetched from Yodlee's catalog (real bank branding, not Zoho's)"],
  ["Prompt text", "\"Enter your {Bank Name} ({ProductSegment}) credentials to connect your account(s) to Zoho Books.\" — bank name fully expanded (vs truncated tile), with product segment in parens (\"Commercial\" / \"Personal\" — Yodlee distinguishes these)"],
  ["Username", "Standard text input, focused on load"],
  ["Password", "Password input + 👁 eye icon for show/hide"],
  ["Yodlee terms disclaimer", "\"By continuing, you agree to Yodlee's terms of use for account linking. Yodlee's use of your data follows the application provider's privacy notice.\""],
  ["Submit button", "Dark navy blue (Yodlee's brand color, not Zoho's — visual cue the iframe is Yodlee-hosted)"],
  ["Footer attribution", "\"On behalf of Zoho · data access provided by yodlee\" — required co-branding for transparency"],
], [2400, 6960]));
body.push(blank());
body.push(P([new TextRun({ text: "Two layers of consent. ", bold: true, font: "Arial" }), new TextRun({ text: "Zoho's EULA in Step 1 covers Zoho ↔ user. Yodlee's terms-of-use link in Step 3 covers Yodlee ↔ user. Standard aggregator-in-the-middle model.", font: "Arial" })]));
body.push(P([new TextRun({ text: "Credentials never touch Zoho's servers. ", bold: true, font: "Arial" }), new TextRun({ text: "The Yodlee-branded iframe runs on Yodlee's domain. Zoho's outer page can't read what's typed inside. PCI/PSD2-compliant pattern.", font: "Arial" })]));

body.push(H3("Step 4-6 — Account selection, backfill, sync start (not yet screenshotted)"));
body.push(P("After successful credential submission:"));
body.push(bullet("Step 4 — Yodlee returns the list of accounts at the bank; user picks which to sync"));
body.push(bullet("Step 5 — Backfill window selector — Zoho's public docs say up to 90 days of history"));
body.push(bullet("Step 6 — User lands back on the Zoho banking page; new account appears in the bankslist; first feed sync starts"));

body.push(H2("Per-feed actions (gear-icon menu on each bank)"));
body.push(bullet("Refresh Feeds — manual fetch, once/day cap"));
body.push(bullet("Update Credentials — when bank password rotates"));
body.push(bullet("Deactivate Feeds — pause auto-sync without deleting the account"));
body.push(bullet("Per-PayPal: Add/Remove Currency sub-feeds"));

body.push(H2("What data each transaction carries (inferred)"));
body.push(bullet("Date (transaction date)"));
body.push(bullet("Posting Date (when bank booked it)"));
body.push(bullet("Description"));
body.push(bullet("Reference / Cheque number"));
body.push(bullet("Amount"));
body.push(bullet("Type (Debit / Credit)"));
body.push(bullet("Running Balance (post-transaction)"));

body.push(H2("Implications for Quikfinance"));
body.push(P("The auto-feed integration is the single biggest piece of work in this module. Two-tier plan:"));
body.push(bullet("v1 (no API integration): CSV / OFX / QIF / CAMT.053 / PDF upload only. Unblocks 80% of the workflow for 20% of the effort."));
body.push(bullet("v2 (Yodlee or Plaid): Add automatic feeds for one provider. ~3 weeks of integration work + Yodlee contract / pricing."));
body.push(bullet("v3 (India-native APIs): ICICI / HDFC / Axis Connected Banking. Each is ~2 weeks separately."));

// 3
body.push(pageBreak());
body.push(H1("3. Bank Accounts list (the /bankslist page)"));
body.push(P("This is the URL you sent — the master grid showing every bank + credit card + PayPal account."));

body.push(H2("What it displays per account"));
body.push(bullet("Account name (clickable → drills into per-account dashboard)"));
body.push(bullet("Bank logo / icon"));
body.push(bullet("Currency"));
body.push(bullet("Current balance (computed live: opening + all transactions)"));
body.push(bullet("Last sync timestamp"));
body.push(bullet("Last reconciled date"));
body.push(bullet("Gear menu (Refresh / Update Credentials / Deactivate / Edit / Mark Inactive / Delete)"));

body.push(H2("Per-account dashboard — Latest Statement Details (6 tiles)"));
body.push(buildTable([
  ["Tile", "Definition"],
  ["Total Transactions", "Count of imported transactions from the latest statement"],
  ["Autocategorised Transactions", "Auto-matched against transaction rules — no manual touch needed"],
  ["Recognised Transactions", "Matched against rules but needed manual confirmation"],
  ["Best Matches", "Bank lines that correspond to existing Quikfinance invoices/bills/payments"],
  ["Uncategorised Transactions", "Bank lines that hit no rule and have no obvious match — manual work"],
  ["Duplicates", "Same statement uploaded twice — auto-excluded by Zoho"],
], [3000, 6360]));
body.push(blank());
body.push(P("Plus: latest statement date, last reconciliation date, count of transaction rules configured for this account."));

body.push(H2("Implications for Quikfinance"));
body.push(P("Quikfinance currently has /banking/accounts (list) and individual account pages, but NO drill-down dashboard with these 6 metrics. The metrics themselves are derived state — easy to compute once we have rules + matching + import infrastructure built. So this dashboard is the last thing we build, not the first."));

// 4
body.push(pageBreak());
body.push(H1("4. Add Transaction (manual entry)"));
body.push(P("Two top-level categories:"));

body.push(H2("Money In"));
body.push(buildTable([
  ["Type", "Use case"],
  ["Customer Payment", "Already-recorded invoice payment"],
  ["Sales (without invoice)", "One-off cash sale not tied to an invoice"],
  ["Interest Income", "Bank interest credit"],
  ["Other Income", "Misc credits — e.g. tax refund"],
  ["Refund (from vendor)", "Vendor returned money"],
  ["Owner Investment", "Owner adds capital"],
  ["Deposit", "Generic credit"],
], [2800, 6560]));

body.push(H2("Money Out"));
body.push(buildTable([
  ["Type", "Use case"],
  ["Vendor Payment", "Already-recorded bill payment"],
  ["Expense", "One-off expense not tied to a bill"],
  ["Owner Drawings", "Owner withdraws capital"],
  ["Transfer Fund", "Move money to another bank account in the same org"],
  ["Refund (to customer)", "Customer refund"],
  ["Card Payment", "Pay down a credit card from a bank account"],
  ["Owner Loan Repayment", "Pay back loan from owner"],
], [2800, 6560]));
body.push(blank());
body.push(P("Each type carries different fields (Vendor combobox for Vendor Payment; Customer combobox for Customer Payment; etc.) and posts to different GL accounts automatically."));
body.push(P("Attachments: up to 5 files, 5MB each."));

body.push(H2("Implications for Quikfinance"));
body.push(P("Quikfinance has these as separate routes (/banking/transactions, /banking/transfers, /banking/card-payments, /banking/owner-drawings, /banking/other-income). The Zoho model is one form with a type dropdown that morphs the form fields. Their model is cleaner — a single BankTransaction create flow with branching UI. Worth a refactor when we touch this."));

// 5
body.push(pageBreak());
body.push(H1("5. Import Bank Statement"));
body.push(P("The make-or-break flow for v1. Detailed shape:"));

body.push(H2("Supported file formats"));
body.push(bullet("CSV — most common; every bank exports this"));
body.push(bullet("TSV — tab-separated, rare"));
body.push(bullet("OFX — Open Financial Exchange, US standard"));
body.push(bullet("QIF — Quicken Interchange, legacy but still used"));
body.push(bullet("CAMT.053 — European ISO 20022 XML"));
body.push(bullet("PDF — parsed via Perfios (third-party OCR service); supports password-protected PDFs"));

body.push(H2("The column-mapping wizard"));
body.push(H3("Step 1 — Upload"));
body.push(P("User selects account + clicks Import Statement, uploads file."));

body.push(H3("Step 2 — Amount column type"));
body.push(bullet("Double Column — separate Debit and Credit columns"));
body.push(bullet("Single Column with Amount Type — one Amount column + a Type column (DR/CR)"));
body.push(bullet("Single Column with Negative Values — one Amount column where negatives are withdrawals"));

body.push(H3("Step 3 — Character Encoding + Delimiter"));
body.push(bullet("Encoding: UTF-8 default; others if bank exports differently"));
body.push(bullet("Delimiter: comma / tab / pipe / semicolon"));

body.push(H3("Step 4 — Field mapping"));
body.push(bullet("Zoho auto-selects the best match for each field (Date, Description, Reference, Amount, Type)"));
body.push(bullet("User can override"));
body.push(bullet("Saves mapping as a preset (so next month's import is one-click)"));

body.push(H3("Step 5 — Preview"));
body.push(bullet("Shows first 10 rows mapped"));
body.push(bullet("Flags unmapped fields"));
body.push(bullet("Flags rows with parse errors"));

body.push(H3("Step 6 — Commit"));
body.push(bullet("All rows imported into BankTransaction table"));
body.push(bullet("Duplicate detection runs immediately"));

body.push(H2("Duplicate detection"));
body.push(P("Logic (inferred from Zoho's behaviour):"));
body.push(bullet("Match on (accountId, date, amount, reference) quadruple"));
body.push(bullet("Optional fuzzy match on description if reference is missing"));
body.push(bullet("Duplicate rows are imported but marked excluded=true with reason \"duplicate of TXN-xxx\""));
body.push(bullet("User can override exclusion individually"));

body.push(H2("Undo last import"));
body.push(P("A gear-icon action on the per-account page lets you reverse the most recent import:"));
body.push(bullet("Shows the count of transactions that will be deleted"));
body.push(bullet("Lets user exclude specific ones from the undo (e.g., a transaction that's been reconciled since)"));
body.push(bullet("Only the most recent import can be undone (older imports require manual delete)"));

body.push(H2("Implications for Quikfinance"));
body.push(P([
  new TextRun({ text: "This is the v1 priority — the entire module is gated on this flow. Reusable from Quikfinance's existing import pattern (", font: "Arial" }),
  new TextRun({ text: "lib/purchases/import-helpers.ts", font: "Consolas", size: 20 }),
  new TextRun({ text: " already has CSV parsing + column mapping for Bills/Vendors). The new addition is OFX/QIF/CAMT.053 parsers (each is an npm package).", font: "Arial" }),
]));
body.push(P("PDF via Perfios — Quikfinance can defer; alternative is Textract / Google Cloud Vision OCR if a bank PDF parser becomes a real customer need."));

// 6
body.push(pageBreak());
body.push(H1("6. Match Transactions (the heart of the module)"));
body.push(P("After a bank statement is imported, each row is either:"));
body.push(bullet("Auto-matched — Zoho's matcher found one obvious existing record"));
body.push(bullet("Best match suggested — multiple candidates; user picks"));
body.push(bullet("Uncategorised — no candidate; user manually creates a new record OR categorises to a GL account"));

body.push(H2("What gets matched against"));
body.push(P("A bank line can match against existing Quikfinance records:"));
body.push(bullet("Customer Payment received"));
body.push(bullet("Vendor Payment made"));
body.push(bullet("Manual Journal entry"));
body.push(bullet("Invoice (if no payment recorded yet — match creates the payment)"));
body.push(bullet("Bill (same — match creates the payment)"));
body.push(bullet("Expense"));
body.push(bullet("Transfer Fund (the other side of an inter-account transfer)"));

body.push(H2("The match UI — two-pane layout"));
body.push(buildTable([
  ["Left pane (the bank line)", "Right pane (candidates)"],
  ["Date", "List of Quikfinance records sorted by match score"],
  ["Description", "Each row: vendor/customer name, amount, type, date, status"],
  ["Amount", "Radio button to select"],
  ["Reference", "Filter pills: Include Withdrawals / Include Deposits / Within ±5 days"],
], [4680, 4680]));
body.push(blank());
body.push(P("Plus a Create New Transaction button — if no record matches, user creates the underlying record (invoice payment / vendor payment / expense) inline. That new record auto-matches itself to the bank line."));

body.push(H2("Adjustment additions"));
body.push(P("For partial matches (e.g., bank line is ₹1000 but actual invoice was ₹950 + ₹50 payment-gateway fee):"));
body.push(bullet("User selects the invoice as primary match"));
body.push(bullet("Clicks Add Adjustment"));
body.push(bullet("Creates a ₹50 expense (\"Payment Gateway Charges\") that combines with the invoice to equal ₹1000"));
body.push(bullet("The combined bundle now matches the bank line cleanly"));

body.push(H2("Multi-statement matching"));
body.push(P("For complex cases (one deposit = sum of multiple invoices, or one withdrawal = sum of multiple bills):"));
body.push(bullet("Toggle Multi-select & Match"));
body.push(bullet("Select multiple Quikfinance records via checkboxes"));
body.push(bullet("System shows combined total + matches against bank line"));

body.push(H2("Cross-type matching"));
body.push(bullet("A deposit (Money In) can match withdrawals (Money Out) — for cashback / refund scenarios"));
body.push(bullet("A withdrawal can match deposits — for reversed transactions"));
body.push(bullet("Filter pills control this: \"Include Withdrawals\" / \"Include Deposits\""));

body.push(H2("Categorise (no match available)"));
body.push(P("When no Quikfinance record matches:"));
body.push(bullet("User picks a GL account (Office Expenses, Rent, Software Subscriptions, etc.)"));
body.push(bullet("Optionally picks a Vendor or Customer"));
body.push(bullet("Optionally adds a Reference, Notes, Tax treatment"));
body.push(bullet("Zoho creates an Expense (Money Out) or Other Income (Money In) record automatically"));

body.push(H2("Match vs Categorise — the critical distinction"));
body.push(buildTable([
  ["Action", "What it does", "When to use"],
  ["Match", "Links the bank line to an existing Quikfinance record", "The Quikfinance record was created BEFORE the bank statement landed"],
  ["Categorise", "Creates a NEW Quikfinance record on the fly", "No existing record; bank line is the source of truth"],
], [1700, 3500, 4160]));

body.push(H2("Implications for Quikfinance"));
body.push(P("This entire module is net-new in Quikfinance — nothing exists today. It's the single biggest feature build in the Banking workstream. Probably 2 weeks for a credible v1:"));
body.push(bullet("Match-candidate suggestion engine (fuzzy match on amount + date + payee)"));
body.push(bullet("The two-pane UI"));
body.push(bullet("Auto-match on exact amount + date"));
body.push(bullet("Categorise fallback flow"));
body.push(bullet("Adjustment additions"));
body.push(bullet("Multi-select"));

// 7
body.push(pageBreak());
body.push(H1("7. Transaction Rules"));
body.push(H2("Rule shape"));
body.push(P("A rule is: IF [conditions] THEN [actions]."));

body.push(H3("Conditions"));
body.push(buildTable([
  ["Field", "Operators"],
  ["Payee", "is, contains, starts with, is empty"],
  ["Description", "is, contains, starts with, is empty"],
  ["Reference Number", "is, contains, starts with, is empty"],
  ["Amount", "=, >, >=, <, <="],
], [3000, 6360]));
body.push(blank());
body.push(P("Plus combinator: \"ALL conditions match\" (AND) or \"ANY condition matches\" (OR)."));

body.push(H3("Actions"));
body.push(P("When a rule fires:"));
body.push(bullet("Record As — Deposit / Withdrawal / Transfer / Customer Payment / Vendor Payment / Expense"));
body.push(bullet("Account — which GL account the transaction posts to"));
body.push(bullet("Paid Via / Payment Mode — Cash, Cheque, Bank Transfer, UPI, etc."));
body.push(bullet("Reference Number — auto-populate from bank statement reference OR set a fixed value"));
body.push(bullet("Category — \"Recognised\" (highlights for user confirmation) or \"Categorised\" (auto-finalised)"));

body.push(H2("Rule lifecycle"));
body.push(bullet("Apply on incoming feeds only (not retroactive)"));
body.push(bullet("Edit / Delete rules from a dedicated /banking/rules page"));
body.push(bullet("Deleted rules don't un-categorize previously-categorized transactions"));

body.push(H2("What Zoho's docs do NOT mention (but real systems have)"));
body.push(bullet("Rule priority / order — when multiple rules match, which wins?"));
body.push(bullet("Suggested rules — \"you've categorized 3 AWS transactions as Software; create a rule?\""));
body.push(bullet("Rule duplication — copy a rule and tweak it"));
body.push(bullet("Test a rule — preview which past transactions would have matched"));
body.push(P("These are likely either undocumented Zoho features OR genuine gaps. Both are worth building in Quikfinance."));

body.push(H2("Implications for Quikfinance"));
body.push(P("New surface area — /banking/rules doesn't exist yet. New models:"));
body.push(bullet("BankRule (conditions JSON + actions JSON + priority)"));
body.push(bullet("Rule application happens during import, not at runtime"));
body.push(P("Effort: ~1 week for v1 (single-condition rules), +3 days for AND/OR combinators, +3 days for suggested rules."));

// 8
body.push(pageBreak());
body.push(H1("8. Reconciliation"));
body.push(H2("The setup"));
body.push(P("User → Banking → pick account → gear → Reconcile Account → Initiate Reconciliation."));
body.push(P("Form fields:"));
body.push(bullet("Start Date — beginning of reconciliation period"));
body.push(bullet("End Date — end of period"));
body.push(bullet("Closing Balance — what the bank statement says is the final balance"));

body.push(H2("The reconciliation screen — two panes"));
body.push(P("Left: All matched, categorised, and manually-added transactions in the period. Each has a checkbox to mark \"Cleared\"."));
body.push(P("Right: Running summary:"));
body.push(bullet("Opening Balance (computed from last reconciliation's closing)"));
body.push(bullet("Cleared Deposits (sum of checked Money In)"));
body.push(bullet("Cleared Withdrawals (sum of checked Money Out)"));
body.push(bullet("Net Cleared = Opening + Deposits − Withdrawals"));
body.push(bullet("Bank's Closing Balance (from setup form)"));
body.push(bullet("Difference = Net Cleared − Closing Balance"));
body.push(blank());
body.push(P([new TextRun({ text: "Goal: ", bold: true, font: "Arial" }), new TextRun({ text: "Difference must equal zero.", font: "Arial" })]));

body.push(H2("When the difference is non-zero"));
body.push(P("The user can:"));
body.push(bullet("Find missing transactions in Quikfinance (add them manually if Zoho missed a bank line)"));
body.push(bullet("Edit the closing balance (if they mistyped from the statement)"));
body.push(bullet("Mark transactions cleared/uncleared to balance"));
body.push(P("Zoho does NOT auto-resolve the discrepancy — that's the accountant's job."));

body.push(H2("Finishing"));
body.push(P("Two options:"));
body.push(bullet("Reconcile — finalize. Cleared transactions are locked from edits; opening balance for next period is set."));
body.push(bullet("Save and Reconcile Later — save progress, come back."));

body.push(H2("Reverse / undo / delete"));
body.push(bullet("Undo Reconciliation — unlocks all transactions in the period; useful when an error is discovered post-finalize"));
body.push(bullet("Delete Reconciliation — removes the reconciliation record entirely; transactions stay but lose their cleared flag"));

body.push(H2("Implications for Quikfinance"));
body.push(P("Reconciliation is independent of matching — you can match every transaction without ever reconciling, OR reconcile without using auto-match. So this can ship as a separate PR after matching."));
body.push(P("Effort: ~1.5 weeks for the full reconcile + undo + delete flow."));

// 9
body.push(pageBreak());
body.push(H1("9. Record Deposit (the niche flow)"));
body.push(H2("What it is"));
body.push(P("A deposit is a transfer from a cash account to a bank account. Customer pays in cash → cash account credited. Later, owner deposits the cash at the bank → bank account credited, cash account debited."));
body.push(P("Without this flow:"));
body.push(bullet("Bank feed shows the deposit"));
body.push(bullet("But Quikfinance has no record of the cash collection"));
body.push(bullet("Reconciliation fails"));

body.push(H2("When NOT to use Record Deposit"));
body.push(bullet("Customer pays via UPI / bank transfer / cheque — that's a regular customer payment, no deposit needed"));
body.push(bullet("Vendor refunds money — that's a refund transaction, not a deposit"));
body.push(P("Deposit is specifically for the cash → bank money movement."));

body.push(H2("Fields"));
body.push(bullet("Date"));
body.push(bullet("Receiving bank account"));
body.push(bullet("Paid Via (cash account being drained)"));
body.push(bullet("Reference number"));
body.push(bullet("Bank charges (deduction if bank charges a fee on cash deposits)"));
body.push(bullet("Optional: filter Funds From by customer / transaction type"));
body.push(bullet("Attachments"));

body.push(H2("Implications for Quikfinance"));
body.push(P("Niche feature — only matters for cash-heavy businesses (retail, food service). Probably defer to v2 unless an early customer specifically asks."));
body.push(P("Effort if built: ~3 days."));

// GAP ANALYSIS
body.push(pageBreak());
body.push(H1("Quikfinance — current state vs Zoho parity"));
body.push(buildTable([
  ["Zoho feature", "Quikfinance state today", "Gap"],
  ["Add Bank Account (manual)", "✅ /banking/accounts/new", "Add Credit Card type + bank-picker UI for v2"],
  ["Auto Bank Feeds (Yodlee)", "❌ Not built", "v2 — needs Yodlee contract + OAuth flow"],
  ["Bank Accounts list", "✅ /banking/accounts", "Missing per-account drill-down dashboard with 6 metrics"],
  ["Per-account Dashboard (6 tiles)", "❌ Not built", "Derived state — easy once rules + matching exist"],
  ["Add Transaction (manual)", "✅ /banking/transactions/new + 5 specialized routes", "Refactor to one form with type dropdown"],
  ["Import Statement (CSV)", "❌ Not built", "v1 priority — reuse lib/purchases/import-helpers.ts"],
  ["Import Statement (OFX/QIF/CAMT)", "❌ Not built", "npm libraries available; ~3 days each"],
  ["Import Statement (PDF)", "❌ Not built", "Needs OCR provider — defer"],
  ["Duplicate detection on import", "❌ Not built", "Logic: (accountId, date, amount, reference)"],
  ["Undo last import", "❌ Not built", "Easy once import exists"],
  ["Match Transactions UI", "❌ Not built", "v1 priority — the biggest piece"],
  ["Match candidate scoring", "❌ Not built", "Fuzzy match on amount + date + payee"],
  ["Add Adjustment in match", "❌ Not built", "Part of match v1"],
  ["Multi-select match", "❌ Not built", "v1 polish"],
  ["Categorise (no-match fallback)", "❌ Not built", "v1 priority"],
  ["Transaction Rules (CRUD)", "❌ Not built", "New BankRule model; ~1 week"],
  ["Rule application on import", "❌ Not built", "Apply during import flow"],
  ["Suggested rules", "❌ Not built", "Nice-to-have"],
  ["Reconciliation flow", "❌ Not built", "v1 priority — independent of matching"],
  ["Undo / Delete Reconciliation", "❌ Not built", "Part of reconcile v1"],
  ["Record Deposit (cash → bank)", "❌ Not built", "Niche — defer"],
], [3000, 3000, 3360]));

// BUILD ORDER
body.push(pageBreak());
body.push(H1("Suggested Quikfinance build order"));
body.push(P("The earlier roadmap doc proposed BNK-1 through BNK-7. Here's the same plan re-prioritized after reading Zoho's actual UX:"));
body.push(blank());
body.push(buildTable([
  ["Order", "PR", "Scope", "Effort", "Why this order"],
  ["1", "BNK-A", "CSV import with column mapping wizard + duplicate detection + undo", "1 week", "Without statements, nothing else matters"],
  ["2", "BNK-B", "Per-account dashboard with 6 metric tiles", "4 days", "First user-visible \"this looks like Zoho\" win"],
  ["3", "BNK-C", "Match Transactions UI — two-pane, candidate scoring, single-match", "1.5 weeks", "The functional heart"],
  ["4", "BNK-D", "Categorise (no-match fallback) + Add Adjustment + Multi-select", "1 week", "Extends BNK-C for long-tail cases"],
  ["5", "BNK-E", "Transaction Rules CRUD + apply-on-import + suggested rules", "1.5 weeks", "Automates the boring matches"],
  ["6", "BNK-F", "Reconciliation flow (initiate + clear + finish + undo + delete)", "1.5 weeks", "Independent; can run parallel to BNK-E if 2 engineers"],
  ["7", "BNK-G", "OFX/QIF/CAMT.053 parsers", "3 days", "One library per format"],
  ["8", "BNK-H", "Multi-currency bank accounts + FX rate cron", "1.5 weeks", "Real for USD/INR orgs"],
  ["9", "BNK-I", "Record Deposit flow", "3 days", "Cash-heavy businesses only"],
  ["10", "BNK-J", "Yodlee / Plaid auto-feeds", "3 weeks", "Game-changer but needs vendor contract"],
  ["11", "BNK-K", "India-native bank APIs (ICICI / HDFC / Axis)", "2 weeks each", "Per-bank work; do one as proof, then scale"],
], [700, 900, 4400, 1400, 1960]));
body.push(blank());
body.push(P([new TextRun({ text: "Total v1 (BNK-A through BNK-F): ~7 weeks. ", bold: true, font: "Arial" }), new TextRun({ text: "Feature-complete clone of Zoho Banking minus the auto-feeds.", font: "Arial" })]));
body.push(P([new TextRun({ text: "With auto-feeds (add BNK-J): ~10 weeks.", bold: true, font: "Arial" })]));

// WHAT I NEED
body.push(H1("What I need from you to start BNK-A"));
body.push(numbered("Sample bank statement CSV — pick one bank you use (ICICI, HDFC, Axis, SBI, etc.) and send me a redacted sample of the export. I'll use it as the test fixture so column auto-mapping works for that bank out of the box."));
body.push(numbered("OFX/QIF priority — do target customers use US banks (OFX is standard) or India-only (CSV is enough)?"));
body.push(numbered("Yodlee budget — Yodlee charges per connected account per month (~$1-2 each). Do we have the budget for this in v1, or pure CSV until v2?"));
body.push(numbered("One Quikfinance bank account = one Zoho-equivalent? — i.e., do we need PayPal-style sub-accounts under one parent, or is each currency a separate top-level bank account?"));
body.push(numbered("Reconciliation strictness — once a transaction is \"cleared\" in a reconciled period, do we hard-block edits (Zoho style) or warn-and-allow (more lenient)?"));
body.push(blank());
body.push(P([new TextRun({ text: "Once those five are answered, BNK-A starts on Day 1 of the next sprint.", italics: true, font: "Arial" })]));

// APPENDIX — confirmed vs inferred
body.push(pageBreak());
body.push(H1("Appendix — Confirmed from screenshots vs inferred from public docs"));
body.push(P("This doc combines two sources. Here's exactly which claims are which:"));

body.push(H2("📸 Confirmed (from Rishabh's tenant screenshots)"));
body.push(bullet("Three-tier integration model — Partner Banks / Automatic Feeds / Manual, with the exact 5 partner-bank logos (Standard Chartered, HSBC, Kotak, SBI, Axis) and 9 Yodlee-supported cards."));
body.push(bullet("Credit cards are a separate account type — HDFC and SBI appear twice in the modal: once as bank accounts, once as credit cards (marked with C badge)."));
body.push(bullet("American Express Cards (India) is in the tier-B credit-card section."));
body.push(bullet("PayPal is in tier B — not a special tier-A partner."));
body.push(bullet("Empty-state copy verbatim: headline \"Stay on top of your money\", sub-copy, primary CTA \"Connect Bank / Credit Card\", secondary \"Add Manually\", skip link, tutorial-video link."));
body.push(bullet("Top-level sidebar IA: Home → Items → Sales → Purchases → Time Tracking → Banking → Accountant → Reports → Documents. Banking sits between Time Tracking and Accountant."));
body.push(bullet("APPS section at the bottom of the sidebar lists Zoho Payroll and Zoho Payments — Zoho's app-launcher pattern. Direct analogue to Quikit."));
body.push(bullet("Free-trial paywall banner at the top: \"Your free trial is over · Subscribe\"."));
body.push(bullet("Add Bank or Credit Card form — field list per type: Bank type carries Account Number + IFSC + Make-this-primary checkbox; Credit Card type carries NONE of those. Both types share Account Name, Account Code, Currency, Bank Name, Description."));
body.push(bullet("Credit-card form is dramatically simpler than the docs implied — no statement cycle date, no credit limit, no card-last-4 at creation."));
body.push(bullet("Yodlee handoff is 3 verified steps (Screenshots 5 + 6 + 7): (1) EULA acceptance with provider-selector dropdown, (2) bank picker with 30-min session timer + searchable Yodlee catalog, (3) Yodlee FastLink credential iframe — bank logo, Username + Password fields, Yodlee terms disclaimer, dark-blue Submit, \"On behalf of Zoho · data access provided by yodlee\" co-branded footer."));
body.push(bullet("Two layers of consent in the handoff: Zoho's EULA (Step 1) for \"automatic bank feeds\" + Yodlee's terms-of-use (Step 3) for \"account linking.\" Aggregator-in-the-middle pattern."));
body.push(bullet("Yodlee catalog distinguishes bank product segments — \"First Internet Bank of Indiana (Commercial)\" suggests separate catalog entries for Personal vs Commercial / Business / Brokerage variants of the same bank."));
body.push(bullet("Yodlee FastLink iframe runs on Yodlee's domain — Submit button is Yodlee's brand navy, not Zoho's blue. Credentials never touch Zoho's servers."));
body.push(bullet("EULA is a hard gate — the Proceed button is disabled until the consent checkbox is ticked. Compliance scaffolding, not optional."));
body.push(bullet("Provider selector is a dropdown (\"Yodlee ▾\" with chevron) — implies alternatives (Token in some regions). Mid-flow switching is supported."));
body.push(bullet("30-minute session timeout on the Yodlee picker — countdown shown in the header (\"You have 29:36 time remaining\"), expires the connection attempt."));
body.push(bullet("Featured bank tiles are regional — Indian tenants see ICICI/HDFC/SBI/Kotak/Axis (Screenshot 2); US tenants see Chase/Wells Fargo/BoA/Capital One/Chime/Navy Federal/Fidelity/USAA/Huntington (Screenshot 6)."));
body.push(bullet("Bank-name overflow uses ellipsis truncation in tiles (\"First Internet Bank of ...\", \"Huntington Bank (Per...\")."));

body.push(H2("🔍 Inferred (from public Zoho help docs only)"));
body.push(bullet("The 24h auto-sync frequency for non-MFA banks"));
body.push(bullet("MFA-bank manual-refresh limit of once per day"));
body.push(bullet("Yodlee backend (their docs reference \"Yodlee's new API platform\")"));
body.push(bullet("Per-transaction fields captured by feeds (Date, Posting Date, Description, Reference, Amount, Type, Running Balance) — Zoho docs don't enumerate"));
body.push(bullet("The two-pane Match Transactions UI layout (docs describe the actions, not the visual layout)"));
body.push(bullet("The Multi-select & Match toggle behaviour"));
body.push(bullet("Reconciliation summary fields (Opening Balance, Cleared Deposits, Cleared Withdrawals, Difference)"));
body.push(bullet("Rule priority / order (not mentioned in docs)"));
body.push(bullet("Suggested-rules feature (not mentioned in docs)"));
body.push(bullet("Duplicate-detection quadruple (accountId, date, amount, reference) — inferred from \"duplicates auto-excluded\" behaviour"));

body.push(H2("❓ Still unknown (would need more screenshots or a live walkthrough)"));
body.push(bullet("The exact field list when you click into a single bank in the bankslist page"));
body.push(bullet("The gear-menu items per bank (the doc mentions Refresh / Update Credentials / Deactivate but doesn't list everything)"));
body.push(bullet("The exact column-mapping wizard UI in the import-statement flow"));
body.push(bullet("The match-transactions screen's actual layout (left/right pane proportions, filter pills)"));
body.push(bullet("The reconciliation report PDF format (if any)"));
body.push(bullet("Whether suggested rules exist + how they're surfaced"));
body.push(bullet("Rule priority handling when multiple rules match one transaction"));
body.push(bullet("Yodlee Step 4-6 — account selection from the bank, backfill date-range picker, final success state"));
body.push(bullet("MFA challenge UX — what happens when a bank requires OTP / security question after the initial Submit"));
body.push(bullet("The alternative bank-feeds provider catalog (the \"Yodlee ▾\" dropdown's other option, likely Token)"));
body.push(bullet("The edit form for an existing account (whether credit-limit / statement-cycle fields appear there even though they're hidden at creation)"));
body.push(bullet("The PayPal account creation form (multi-currency picker)"));
body.push(blank());
body.push(P([new TextRun({ text: "If you can send screenshots of any of these, I'll update the appendix and the relevant sections.", italics: true, font: "Arial" })]));

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
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: "Quikfinance · Zoho Banking Research", font: "Arial", size: 18, color: "9CA3AF" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: "Page ", font: "Arial", size: 18, color: "9CA3AF" }),
        new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 18, color: "9CA3AF" }),
        new TextRun({ text: " of ", font: "Arial", size: 18, color: "9CA3AF" }),
        new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 18, color: "9CA3AF" }),
      ] })] }) },
    children: body,
  }],
});

const outPath = path.join(__dirname, "zoho-banking-research.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(outPath, buf);
  console.log(`wrote ${outPath} (${buf.length} bytes)`);
});
