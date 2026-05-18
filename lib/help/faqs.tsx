import * as React from "react";
import Link from "next/link";

/**
 * Quikfinance Help — frequently-asked-questions data.
 *
 * Categorised + anchored. Each FAQ has a stable `id` so the FYE
 * page (and any other surface) can deep-link to the answer via
 * `/help/{category}#${id}`.
 *
 * Answers are React nodes so they can embed inline `<Link>`s to
 * the actual feature routes — the most useful kind of help is a
 * one-click jump to the screen the user needs.
 */

export type Faq = {
  id: string; // url-anchor: "modify-invoice-number"
  q: string;
  a: React.ReactNode;
};

export type FaqCategory = {
  slug: string; // url segment: "fiscal-year-end-tasks"
  title: string;
  description: string;
  faqs: Faq[];
};

// Small helper for the most common answer-paragraph pattern.
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed">{children}</p>;
}

function Step({ children }: { children: React.ReactNode }) {
  return <li className="text-sm leading-relaxed">{children}</li>;
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs text-muted-foreground mt-2 italic">{children}</p>
  );
}

// ─── Categories ─────────────────────────────────────────────────

export const HELP_CATEGORIES: FaqCategory[] = [
  {
    slug: "fiscal-year-end-tasks",
    title: "Fiscal Year-End Tasks",
    description:
      "Closing your books, preparing statements, and exporting for tax filing.",
    faqs: [
      {
        id: "modify-invoice-number",
        q: "How do I modify the auto-generated invoice number for the new financial year?",
        a: (
          <>
            <P>
              Quikfinance auto-generates invoice numbers using the
              prefix configured in your number series. To roll over
              for a new fiscal year:
            </P>
            <ol className="list-decimal ml-5 space-y-1.5 mt-2">
              <Step>
                Open{" "}
                <Link
                  href="/settings/number-series"
                  className="text-primary hover:underline"
                >
                  Settings → Number Series
                </Link>
              </Step>
              <Step>
                Find the <strong>Invoice</strong> row and click{" "}
                <em>Edit</em>
              </Step>
              <Step>
                Update the prefix (e.g. <code>INV-26-</code> for
                FY 2026-27) and the next-number sequence
              </Step>
              <Step>Save</Step>
            </ol>
            <Hint>
              Tip: the same flow applies to Bills, Credit Notes,
              Vendor Credits, Payments, and Manual Journals — each
              has its own series.
            </Hint>
          </>
        ),
      },
      {
        id: "outstanding-customer-amounts",
        q: "How do I find the outstanding amount that customers owe me?",
        a: (
          <>
            <P>
              Two reports show open receivables, each from a
              different angle:
            </P>
            <ul className="list-disc ml-5 space-y-1.5 mt-2">
              <Step>
                <Link
                  href="/reports/ar-aging"
                  className="text-primary hover:underline"
                >
                  AR Aging Summary
                </Link>{" "}
                — buckets (0-30 / 31-60 / 61-90 / 90+ days) per
                customer
              </Step>
              <Step>
                <Link
                  href="/sales/customers"
                  className="text-primary hover:underline"
                >
                  Customer Statement
                </Link>{" "}
                — pick a customer, see their open balance + full
                ledger
              </Step>
            </ul>
            <Hint>
              Both reports can be exported to CSV/XLSX. For
              year-end, set the &ldquo;As of&rdquo; date to your
              fiscal-year-end (Mar 31 in India).
            </Hint>
          </>
        ),
      },
      {
        id: "inventory-valuation",
        q: "How do I get the exact value of the goods in my inventory?",
        a: (
          <>
            <P>
              Run the{" "}
              <Link
                href="/reports/stock-valuation"
                className="text-primary hover:underline"
              >
                Stock Valuation
              </Link>{" "}
              report. It shows each tracked item&apos;s quantity-
              on-hand multiplied by its current cost — a total
              inventory value at the bottom.
            </P>
            <P>
              For your statutory year-end snapshot, set the
              &ldquo;As of&rdquo; date in the filter strip to
              Mar 31 (or your FY end). The page recomputes against
              historical movements.
            </P>
          </>
        ),
      },
      {
        id: "documents-for-tax-filing",
        q: "What are the documents that I should send to my accountant to file my taxes?",
        a: (
          <>
            <P>
              Your accountant typically needs every line below for
              an Indian FY close. Each link goes directly to the
              relevant report — export to PDF/XLSX/CSV from there:
            </P>
            <ul className="list-disc ml-5 space-y-1.5 mt-2">
              <Step>
                <Link
                  href="/reports/trial-balance"
                  className="text-primary hover:underline"
                >
                  Trial Balance
                </Link>{" "}
                (as of FY end)
              </Step>
              <Step>
                <Link
                  href="/reports/profit-loss"
                  className="text-primary hover:underline"
                >
                  Profit &amp; Loss
                </Link>{" "}
                (full FY)
              </Step>
              <Step>
                <Link
                  href="/reports/balance-sheet"
                  className="text-primary hover:underline"
                >
                  Balance Sheet
                </Link>{" "}
                (as of FY end)
              </Step>
              <Step>
                <Link
                  href="/reports/cash-flow"
                  className="text-primary hover:underline"
                >
                  Cash Flow Statement
                </Link>{" "}
                (full FY)
              </Step>
              <Step>
                <Link
                  href="/reports/profit-loss-schedule-iii"
                  className="text-primary hover:underline"
                >
                  P&amp;L (Schedule III)
                </Link>{" "}
                — Companies Act format
              </Step>
              <Step>
                <Link
                  href="/reports/balance-sheet-schedule-iii"
                  className="text-primary hover:underline"
                >
                  Balance Sheet (Schedule III)
                </Link>
              </Step>
              <Step>
                <Link
                  href="/reports/gstr1"
                  className="text-primary hover:underline"
                >
                  GSTR-1 Export
                </Link>{" "}
                — per month
              </Step>
              <Step>
                <Link
                  href="/reports/sales-summary"
                  className="text-primary hover:underline"
                >
                  Sales Summary
                </Link>{" "}
                (full FY)
              </Step>
              <Step>
                Bank statements — download from{" "}
                <Link
                  href="/banking"
                  className="text-primary hover:underline"
                >
                  Banking
                </Link>{" "}
                per account
              </Step>
              <Step>
                Any TDS certificates, tax challans, and supporting
                receipts you&apos;ve received during the year
              </Step>
            </ul>
            <Hint>
              Pro tip: use{" "}
              <Link
                href="/reports"
                className="text-primary hover:underline"
              >
                Reports Center
              </Link>
              &apos;s &ldquo;Schedule&rdquo; feature on each
              report to have them emailed automatically each
              month.
            </Hint>
          </>
        ),
      },
      {
        id: "close-books-for-year",
        q: "How do I close my books for the year?",
        a: (
          <>
            <P>
              Quikfinance doesn&apos;t require a hard
              &ldquo;close&rdquo; action — your books are always
              live. The recommended year-end workflow:
            </P>
            <ol className="list-decimal ml-5 space-y-1.5 mt-2">
              <Step>
                Work through the checklist on{" "}
                <Link
                  href="/fiscal-year-end"
                  className="text-primary hover:underline"
                >
                  Fiscal Year-End Tasks
                </Link>
              </Step>
              <Step>
                Reconcile every bank account and reach 0
                un-reconciled items
              </Step>
              <Step>
                Post depreciation, prepaid amortisation, and other
                year-end adjusting entries via Manual Journals
              </Step>
              <Step>
                Run the final{" "}
                <Link
                  href="/reports/trial-balance"
                  className="text-primary hover:underline"
                >
                  Trial Balance
                </Link>{" "}
                and verify it balances
              </Step>
              <Step>
                Export the statutory pack listed in &ldquo;What
                documents to send to my accountant?&rdquo;
              </Step>
            </ol>
            <Hint>
              Period-locking (so users can&apos;t edit historical
              transactions) is on the roadmap.
            </Hint>
          </>
        ),
      },
      {
        id: "schedule-iii-statements",
        q: "How do I generate Schedule III (Companies Act) statements?",
        a: (
          <>
            <P>
              Quikfinance ships two Companies-Act-2013 compliant
              reports out of the box:
            </P>
            <ul className="list-disc ml-5 space-y-1.5 mt-2">
              <Step>
                <Link
                  href="/reports/profit-loss-schedule-iii"
                  className="text-primary hover:underline"
                >
                  Profit &amp; Loss (Schedule III)
                </Link>{" "}
                — 15-section roman-numeralled layout
              </Step>
              <Step>
                <Link
                  href="/reports/balance-sheet-schedule-iii"
                  className="text-primary hover:underline"
                >
                  Balance Sheet (Schedule III)
                </Link>{" "}
                — two-pane Equity &amp; Liabilities / Assets
                comparative layout
              </Step>
            </ul>
            <P>
              Both auto-map your chart of accounts to the
              Schedule III buckets. Pick the As-of date for BS or
              the FY range for P&amp;L, then Export → CSV/XLSX/PDF
              for your filing pack.
            </P>
          </>
        ),
      },
    ],
  },

  {
    slug: "getting-started",
    title: "Getting Started",
    description:
      "Setting up your organisation and your first transactions.",
    faqs: [
      {
        id: "add-organisation-details",
        q: "How do I add my organisation's address and tax details?",
        a: (
          <P>
            Go to{" "}
            <Link
              href="/settings/profile"
              className="text-primary hover:underline"
            >
              Settings → Organisation Profile
            </Link>{" "}
            and fill in address, GSTIN, PAN, and contact info. These
            details auto-populate every invoice, bill, and report
            you generate.
          </P>
        ),
      },
      {
        id: "invite-accountant",
        q: "How do I invite my accountant or team?",
        a: (
          <P>
            Open{" "}
            <Link
              href="/settings/users"
              className="text-primary hover:underline"
            >
              Settings → Users
            </Link>{" "}
            and click &ldquo;Invite User&rdquo;. Pick a role
            (Accountant, Staff, Read-only, etc.) and enter their
            email — they&apos;ll get an invite link.
          </P>
        ),
      },
      {
        id: "first-invoice",
        q: "How do I create my first invoice?",
        a: (
          <>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Add at least one Customer at{" "}
                <Link
                  href="/sales/customers/new"
                  className="text-primary hover:underline"
                >
                  Sales → Customers → New
                </Link>
              </Step>
              <Step>
                Open{" "}
                <Link
                  href="/sales/invoices/new"
                  className="text-primary hover:underline"
                >
                  Sales → Invoices → New
                </Link>
              </Step>
              <Step>
                Pick the customer, add line items, set GST, click
                &ldquo;Save as Open&rdquo;
              </Step>
            </ol>
            <Hint>
              The invoice immediately appears in your AR Aging
              and Profit &amp; Loss reports.
            </Hint>
          </>
        ),
      },
      {
        id: "first-bill",
        q: "How do I create my first vendor bill?",
        a: (
          <>
            <ol className="list-decimal ml-5 space-y-1.5">
              <Step>
                Add a Vendor at{" "}
                <Link
                  href="/purchases/vendors/new"
                  className="text-primary hover:underline"
                >
                  Purchases → Vendors → New
                </Link>
              </Step>
              <Step>
                Open{" "}
                <Link
                  href="/purchases/bills/new"
                  className="text-primary hover:underline"
                >
                  Purchases → Bills → New
                </Link>
              </Step>
              <Step>
                Enter the vendor invoice number, due date, line
                items, and save as Open
              </Step>
            </ol>
          </>
        ),
      },
    ],
  },

  {
    slug: "sales-and-invoicing",
    title: "Sales & Invoicing",
    description: "Invoices, recurring invoices, credit notes, customer payments.",
    faqs: [
      {
        id: "recurring-invoice",
        q: "How do I create a recurring invoice?",
        a: (
          <P>
            Open{" "}
            <Link
              href="/sales/recurring-invoices/new"
              className="text-primary hover:underline"
            >
              Sales → Recurring Invoices → New
            </Link>
            . Set the start date, frequency (weekly / monthly /
            quarterly / yearly), and end condition. Quikfinance
            creates the child invoices automatically on schedule.
          </P>
        ),
      },
      {
        id: "record-customer-payment",
        q: "How do I record a payment received from a customer?",
        a: (
          <P>
            Open the invoice and click &ldquo;Record Payment&rdquo;,
            or go to{" "}
            <Link
              href="/sales/customer-payments/new"
              className="text-primary hover:underline"
            >
              Sales → Payments Received → New
            </Link>{" "}
            and allocate the payment across one or more open
            invoices for that customer.
          </P>
        ),
      },
      {
        id: "issue-credit-note",
        q: "How do I issue a credit note?",
        a: (
          <P>
            From the invoice detail page, click More →{" "}
            <em>Create Credit Note</em>. Or open{" "}
            <Link
              href="/sales/credit-notes/new"
              className="text-primary hover:underline"
            >
              Sales → Credit Notes → New
            </Link>{" "}
            and pick the customer + lines you&apos;re crediting.
          </P>
        ),
      },
      {
        id: "customer-statement",
        q: "How do I send a customer their statement?",
        a: (
          <P>
            Open{" "}
            <Link
              href="/sales/customers"
              className="text-primary hover:underline"
            >
              Sales → Customers
            </Link>
            , click on the customer, then the &ldquo;Statement&rdquo;
            tab. You can export the statement to PDF or email it
            directly.
          </P>
        ),
      },
    ],
  },

  {
    slug: "purchases-and-bills",
    title: "Purchases & Bills",
    description: "Vendor bills, expenses, recurring bills, vendor payments.",
    faqs: [
      {
        id: "categorise-expense",
        q: "How do I categorise an expense?",
        a: (
          <P>
            When creating an expense at{" "}
            <Link
              href="/purchases/expenses/new"
              className="text-primary hover:underline"
            >
              Purchases → Expenses → New
            </Link>
            , pick the expense Category from the dropdown — this
            maps to your Chart of Accounts and determines which P&amp;L
            line it hits.
          </P>
        ),
      },
      {
        id: "recurring-bill",
        q: "How do I set up a recurring vendor bill?",
        a: (
          <P>
            Use{" "}
            <Link
              href="/purchases/recurring-bills/new"
              className="text-primary hover:underline"
            >
              Purchases → Recurring Bills → New
            </Link>
            . Set the cadence — Quikfinance creates child bills as
            drafts on each due date so you can review before posting.
          </P>
        ),
      },
      {
        id: "vendor-payment",
        q: "How do I record a payment to a vendor?",
        a: (
          <P>
            Open the bill and click &ldquo;Record Payment&rdquo;, or
            use{" "}
            <Link
              href="/purchases/payments-made/new"
              className="text-primary hover:underline"
            >
              Purchases → Payments Made → New
            </Link>
            . Pick which bill(s) the payment applies to.
          </P>
        ),
      },
    ],
  },

  {
    slug: "banking",
    title: "Banking",
    description: "Bank accounts, statement imports, reconciliation.",
    faqs: [
      {
        id: "add-bank-account",
        q: "How do I add a bank account?",
        a: (
          <P>
            Open{" "}
            <Link
              href="/banking/accounts"
              className="text-primary hover:underline"
            >
              Banking → Accounts
            </Link>{" "}
            and click &ldquo;Add Account&rdquo;. Pick the type
            (Bank / Credit Card / Cash), set the opening balance,
            and save.
          </P>
        ),
      },
      {
        id: "import-bank-csv",
        q: "How do I import a bank statement?",
        a: (
          <P>
            Open the bank account and click &ldquo;Import
            Statement&rdquo;. Drop a CSV exported from your bank.
            Quikfinance maps the columns and stages each transaction
            for review.
          </P>
        ),
      },
      {
        id: "reconcile",
        q: "How do I reconcile my bank account?",
        a: (
          <P>
            On the bank account page, click &ldquo;Reconcile&rdquo;,
            enter the statement balance + date, and tick off
            transactions that match your statement. Difference
            should reach zero before you save.
          </P>
        ),
      },
    ],
  },

  {
    slug: "taxes-and-gst",
    title: "Taxes & GST",
    description: "GSTIN, tax rates, GSTR-1, reverse charge.",
    faqs: [
      {
        id: "configure-gstin",
        q: "How do I configure my GSTIN?",
        a: (
          <P>
            Go to{" "}
            <Link
              href="/settings/profile"
              className="text-primary hover:underline"
            >
              Settings → Organisation Profile
            </Link>
            , enter your GSTIN, and choose composition vs regular.
            Quikfinance applies the right GST split (CGST+SGST vs
            IGST) based on the customer&apos;s state.
          </P>
        ),
      },
      {
        id: "gstr1-export",
        q: "How do I export GSTR-1?",
        a: (
          <P>
            Open{" "}
            <Link
              href="/reports/gstr1"
              className="text-primary hover:underline"
            >
              Reports → GSTR-1
            </Link>
            . Pick the month, click Export → JSON (for GST portal
            upload) or XLSX (for accountant review).
          </P>
        ),
      },
      {
        id: "tax-rates",
        q: "How do I add a new tax rate?",
        a: (
          <P>
            Open{" "}
            <Link
              href="/settings/taxes"
              className="text-primary hover:underline"
            >
              Settings → Taxes
            </Link>{" "}
            and click &ldquo;Add Tax&rdquo;. Choose the rate
            (e.g. 18%), tax type (GST / IGST), and save. New tax
            rates appear in the dropdown on every transaction line
            item.
          </P>
        ),
      },
    ],
  },

  {
    slug: "reports",
    title: "Reports",
    description: "P&L, Balance Sheet, Cash Flow, compare periods, scheduling.",
    faqs: [
      {
        id: "compare-periods",
        q: "How do I compare two periods on a report?",
        a: (
          <P>
            Open any of P&amp;L / Balance Sheet / Cash Flow, click
            &ldquo;Customize&rdquo;, set &ldquo;Compare With&rdquo;
            to <em>Previous Period</em> or <em>Previous Year</em>,
            and Run Report. The page renders a 4-column layout
            (label / current / previous / % change).
          </P>
        ),
      },
      {
        id: "schedule-report-email",
        q: "How do I schedule a report by email?",
        a: (
          <P>
            On P&amp;L / Balance Sheet / Cash Flow, click the
            Schedule icon in the toolbar. Set the cadence (daily /
            weekly / monthly), format (PDF / XLSX / CSV), and
            recipient emails. Quikfinance sends the report
            automatically on the chosen schedule.
          </P>
        ),
      },
      {
        id: "report-basis",
        q: "What's the difference between Accrual and Cash basis?",
        a: (
          <P>
            <strong>Accrual</strong> recognises revenue when
            invoiced and expenses when billed (standard for
            Companies Act).{" "}
            <strong>Cash</strong> recognises them only when money
            actually moves. Toggle the basis from the &ldquo;Report
            Basis&rdquo; pill on any of the 3 statements.
          </P>
        ),
      },
    ],
  },
];

// ─── Lookup helpers ─────────────────────────────────────────────

export function findCategory(slug: string): FaqCategory | undefined {
  return HELP_CATEGORIES.find((c) => c.slug === slug);
}

export function allFaqCount(): number {
  return HELP_CATEGORIES.reduce((acc, c) => acc + c.faqs.length, 0);
}
