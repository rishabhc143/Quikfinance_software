import Link from "next/link";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Calculator,
  FileText,
  FileBadge,
  Send,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

export const metadata = {
  title: "The Ultimate Guide to Closing Your Books · Quikfinance",
};
export const dynamic = "force-static";

/**
 * Long-form article-style guide. Public route (matched by
 * /help in middleware PUBLIC_PATHS so unauthenticated readers
 * can land here from marketing emails or SEO).
 */
export default function YearEndClosingGuidePage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Brand nav */}
      <header className="border-b bg-background">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link
            href="/"
            className="text-base font-semibold hover:text-primary"
          >
            Quikfinance
          </Link>
          <Link
            href="/fiscal-year-end"
            className="text-sm text-primary hover:underline"
          >
            ← Back to Fiscal Year-End
          </Link>
        </div>
      </header>

      {/* Title banner */}
      <div className="border-b bg-gradient-to-b from-muted/30 to-background">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
            <Link
              href="/help"
              className="hover:text-primary inline-flex items-center gap-1"
            >
              <ChevronLeft className="h-3 w-3" />
              Help Center
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>The Ultimate Guide to Closing Your Books</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-md bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
              <BookOpen className="h-7 w-7 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold leading-tight">
                The Ultimate Guide to Closing Your Books
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                Everything an Indian SMB needs to know to wrap up a
                fiscal year cleanly — reconciliation, adjustments,
                statutory exports, and the handoff to your accountant.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                10 min read · Updated for FY 2025-26
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Article body */}
      <article className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        {/* Intro */}
        <section className="space-y-3">
          <p className="text-base leading-relaxed">
            For most businesses in India, the fiscal year runs{" "}
            <strong>April 1 → March 31</strong>. The 30 days around
            that boundary are the most accounting-heavy of the year:
            reconciling bank accounts, posting adjustment entries,
            preparing statutory statements, filing GST returns, and
            handing everything to your accountant for the income-tax
            return and (for companies) the MCA filing.
          </p>
          <p className="text-base leading-relaxed">
            Quikfinance doesn&apos;t require you to <em>hard close</em>{" "}
            the books like older desktop tools do. Your books stay
            live and editable — but the discipline of closing
            properly still matters for tax compliance and clean
            audit trails. This guide walks you through the five
            stages we recommend.
          </p>
        </section>

        {/* Stage 1 */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <span className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center text-sm font-semibold text-blue-700">
              1
            </span>
            Reconcile everything
          </h2>
          <p className="text-base leading-relaxed">
            Before posting any year-end entries, make sure
            Quikfinance&apos;s view of the world matches reality.
          </p>
          <ul className="list-disc ml-6 space-y-1.5 text-base leading-relaxed">
            <li>
              <strong>Bank accounts</strong> — go to{" "}
              <Link
                href="/banking"
                className="text-primary hover:underline"
              >
                Banking
              </Link>{" "}
              and reconcile each account to a zero difference vs
              the March 31 statement.
            </li>
            <li>
              <strong>Customer balances</strong> — run{" "}
              <Link
                href="/reports/ar-aging"
                className="text-primary hover:underline"
              >
                AR Aging
              </Link>{" "}
              and confirm open invoices match what customers say
              they owe.
            </li>
            <li>
              <strong>Vendor balances</strong> — same for{" "}
              <Link
                href="/reports/ap-aging"
                className="text-primary hover:underline"
              >
                AP Aging
              </Link>
              .
            </li>
            <li>
              <strong>Inventory</strong> — do a physical stock
              count and post{" "}
              <Link
                href="/items/stock-adjustments/new"
                className="text-primary hover:underline"
              >
                Stock Adjustments
              </Link>{" "}
              for any discrepancies (damage, shrinkage, recount).
            </li>
          </ul>
          <div className="text-xs text-muted-foreground bg-muted/40 border-l-2 border-primary/40 px-3 py-2 rounded-r">
            <span className="font-medium text-foreground">Tip:</span>{" "}
            If a bank account hasn&apos;t been reconciled in months,
            do January and February first, then March. Tackling 3
            months at once is much harder than tackling them one at
            a time.
          </div>
        </section>

        {/* Stage 2 */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <span className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center text-sm font-semibold text-blue-700">
              2
            </span>
            Post year-end adjustment entries
          </h2>
          <p className="text-base leading-relaxed">
            These are the entries that match revenue with the period
            it relates to and bring your books in line with accrual
            accounting. All are posted via{" "}
            <Link
              href="/accountant/manual-journals/new"
              className="text-primary hover:underline"
            >
              Manual Journals
            </Link>
            .
          </p>
          <div className="space-y-2.5">
            <AdjustmentRow
              icon={Calculator}
              title="Depreciation"
              detail="On every fixed asset (laptops, vehicles, machinery). Choose SLM or WDV per your policy."
            />
            <AdjustmentRow
              icon={FileText}
              title="Prepaid expense amortisation"
              detail="Insurance, rent, annual software licences paid in advance — recognise the portion that's expired."
            />
            <AdjustmentRow
              icon={Send}
              title="Accrued expenses"
              detail="Services received but not yet billed (e.g., December electricity bill arriving in January)."
            />
            <AdjustmentRow
              icon={FileText}
              title="Deferred revenue"
              detail="Money received in advance for services not yet delivered."
            />
            <AdjustmentRow
              icon={AlertTriangle}
              title="Bad-debt provision"
              detail="AR you don't realistically expect to collect."
            />
            <AdjustmentRow
              icon={Calculator}
              title="FX revaluation"
              detail="Revalue open foreign-currency balances at the FY-end rate via Currency Adjustments."
            />
          </div>
        </section>

        {/* Stage 3 */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <span className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center text-sm font-semibold text-blue-700">
              3
            </span>
            Run final reports
          </h2>
          <p className="text-base leading-relaxed">
            Once reconciled and adjusted, generate the core
            statements. These are the documents your accountant
            will work from for the income-tax return.
          </p>
          <ul className="list-disc ml-6 space-y-1.5 text-base leading-relaxed">
            <li>
              <Link
                href="/reports/trial-balance"
                className="text-primary hover:underline"
              >
                Trial Balance
              </Link>{" "}
              — verify it balances to zero
            </li>
            <li>
              <Link
                href="/reports/profit-loss"
                className="text-primary hover:underline"
              >
                Profit &amp; Loss
              </Link>{" "}
              — full FY range
            </li>
            <li>
              <Link
                href="/reports/balance-sheet"
                className="text-primary hover:underline"
              >
                Balance Sheet
              </Link>{" "}
              — as of March 31
            </li>
            <li>
              <Link
                href="/reports/cash-flow"
                className="text-primary hover:underline"
              >
                Cash Flow Statement
              </Link>{" "}
              — full FY
            </li>
          </ul>
        </section>

        {/* Stage 4 */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <span className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center text-sm font-semibold text-blue-700">
              4
            </span>
            Generate statutory statements
          </h2>
          <p className="text-base leading-relaxed">
            For Companies Act 2013 compliance (MCA filing), you need
            P&amp;L and Balance Sheet in the Schedule III format.
            Quikfinance generates both automatically by mapping your
            Chart of Accounts to the prescribed buckets.
          </p>
          <ul className="list-disc ml-6 space-y-1.5 text-base leading-relaxed">
            <li>
              <Link
                href="/reports/profit-loss-schedule-iii"
                className="text-primary hover:underline"
              >
                Profit &amp; Loss (Schedule III)
              </Link>{" "}
              — 15-section roman-numeralled format
            </li>
            <li>
              <Link
                href="/reports/balance-sheet-schedule-iii"
                className="text-primary hover:underline"
              >
                Balance Sheet (Schedule III)
              </Link>{" "}
              — Equity &amp; Liabilities / Assets two-pane format
            </li>
          </ul>
          <p className="text-base leading-relaxed">
            For GST compliance, ensure your{" "}
            <Link
              href="/reports/gstr1"
              className="text-primary hover:underline"
            >
              GSTR-1
            </Link>{" "}
            export for every month of the FY is filed, then download
            them for your archive.
          </p>
        </section>

        {/* Stage 5 */}
        <section className="space-y-3">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <span className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-950/40 flex items-center justify-center text-sm font-semibold text-blue-700">
              5
            </span>
            Handoff to your accountant
          </h2>
          <p className="text-base leading-relaxed">
            Your accountant needs the statutory pack plus
            supporting documents. Export everything to PDF/XLSX
            and zip it together.
          </p>
          <ul className="list-disc ml-6 space-y-1.5 text-base leading-relaxed">
            <li>
              All four statements (TB, P&amp;L, BS, CF)
            </li>
            <li>Schedule III P&amp;L + BS</li>
            <li>GSTR-1 for every month</li>
            <li>GSTR-3B filing acknowledgements (from GST portal)</li>
            <li>Bank statements for every account</li>
            <li>
              TDS certificates (Form 16A) received from customers
            </li>
            <li>Form 26Q filings (TDS deducted)</li>
            <li>Tax challans for advance tax payments</li>
            <li>Fixed-asset register + depreciation schedule</li>
          </ul>
          <div className="text-xs text-muted-foreground bg-muted/40 border-l-2 border-primary/40 px-3 py-2 rounded-r">
            <span className="font-medium text-foreground">Pro tip:</span>{" "}
            Schedule monthly P&amp;L + BS emails to your accountant
            via the{" "}
            <Link
              href="/reports"
              className="text-primary hover:underline"
            >
              Reports Center
            </Link>
            &apos;s Schedule feature. Year-end becomes a non-event.
          </div>
        </section>

        {/* Common pitfalls */}
        <section className="space-y-3 border-t pt-8">
          <h2 className="text-xl font-semibold">Common pitfalls</h2>
          <ul className="space-y-3 text-base leading-relaxed">
            <li>
              <strong>Skipping the physical stock count.</strong>{" "}
              Inventory valuation is often the largest year-end
              number; a recount almost always finds discrepancies.
            </li>
            <li>
              <strong>Forgetting the MSME 45-day rule.</strong> If
              you have vendors registered as MSME, payments
              outstanding beyond 45 days are disallowed as a
              deduction in your income-tax return.
            </li>
            <li>
              <strong>Filing GSTR-3B late on the March return.</strong>{" "}
              Late filing past the due date loses Input Tax Credit
              for that month — irreversible after the September
              return of the next year.
            </li>
            <li>
              <strong>
                Posting depreciation after issuing reports.
              </strong>{" "}
              Run depreciation FIRST so your P&amp;L and BS reflect
              the correct period expense.
            </li>
            <li>
              <strong>
                Not rolling over the invoice number prefix.
              </strong>{" "}
              Update at{" "}
              <Link
                href="/settings/number-series"
                className="text-primary hover:underline"
              >
                Settings → Number Series
              </Link>{" "}
              for the new FY (e.g., <code>INV-26-0001</code>).
            </li>
          </ul>
        </section>

        {/* Quikfinance shortcuts */}
        <section className="space-y-3 border-t pt-8">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            Quikfinance shortcuts
          </h2>
          <ul className="space-y-2 text-base leading-relaxed">
            <li>
              <Link
                href="/fiscal-year-end"
                className="text-primary hover:underline"
              >
                Fiscal Year-End Tasks
              </Link>{" "}
              page — checklist + Schedule III shortcuts in one
              place
            </li>
            <li>
              Recurring Manual Journals — set monthly depreciation
              to auto-fire so you never miss a period
            </li>
            <li>
              Schedule Reports — auto-email FY-end pack to your
              accountant
            </li>
          </ul>
        </section>

        {/* Related FAQs */}
        <section className="space-y-3 border-t pt-8">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-blue-600" />
            Related FAQs
          </h2>
          <ul className="space-y-2 text-base leading-relaxed">
            <li>
              <Link
                href="/help/fiscal-year-end-tasks#close-books-for-year"
                className="text-primary hover:underline"
              >
                How do I close my books for the year?
              </Link>
            </li>
            <li>
              <Link
                href="/help/fiscal-year-end-tasks#year-end-adjustments"
                className="text-primary hover:underline"
              >
                What year-end adjustment entries should I post?
              </Link>
            </li>
            <li>
              <Link
                href="/help/fiscal-year-end-tasks#documents-for-tax-filing"
                className="text-primary hover:underline"
              >
                What documents should I send to my accountant?
              </Link>
            </li>
            <li>
              <Link
                href="/help/fiscal-year-end-tasks#schedule-iii-statements"
                className="text-primary hover:underline"
              >
                How do I generate Schedule III statements?
              </Link>
            </li>
            <li>
              <Link
                href="/help/fiscal-year-end-tasks#modify-invoice-number"
                className="text-primary hover:underline"
              >
                How do I modify the invoice number for the new FY?
              </Link>
            </li>
          </ul>
          <Link
            href="/help/fiscal-year-end-tasks"
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline mt-3"
          >
            Browse all year-end FAQs
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </section>

        {/* Support footer */}
        <section className="border-t pt-8">
          <div className="rounded-lg border bg-blue-50/40 dark:bg-blue-950/10 p-5 flex items-start gap-4">
            <div className="h-10 w-10 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <FileBadge className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1 space-y-1">
              <h3 className="text-base font-semibold">
                Need year-end help?
              </h3>
              <p className="text-sm text-muted-foreground">
                Email our team for a free 30-minute year-end
                review session.
              </p>
              <div className="flex items-center gap-4 text-sm pt-1">
                <a
                  href="mailto:support@quikfinance.in"
                  className="text-primary hover:underline"
                >
                  support@quikfinance.in
                </a>
                <span className="text-muted-foreground">
                  Helpline: 18003093036
                </span>
              </div>
            </div>
          </div>
        </section>
      </article>
    </div>
  );
}

function AdjustmentRow({
  icon: Icon,
  title,
  detail,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-background p-3">
      <Icon className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
      <div className="text-sm leading-relaxed">
        <span className="font-semibold">{title}</span> — {detail}
      </div>
    </div>
  );
}
