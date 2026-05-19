import Link from "next/link";
import {
  Video,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Zap,
  FileBadge,
  AlertTriangle,
} from "lucide-react";

export const metadata = {
  title: "Year-End Tips & Procedures · Quikfinance",
};
export const dynamic = "force-static";

/**
 * Short-form tips list — companion to the long-form ultimate
 * guide. Reuses the same brand-nav + amber/blue colour palette.
 */
export default function YearEndTipsPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between">
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
            <span>Year-End Tips &amp; Procedures</span>
          </div>
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-md bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
              <Video className="h-7 w-7 text-blue-600" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold leading-tight">
                Year-End Tips &amp; Procedures
              </h1>
              <p className="text-sm text-muted-foreground mt-2">
                10 quick wins that make your March-31 close faster,
                cleaner, and less stressful.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                5 min read · Updated for FY 2025-26
              </p>
            </div>
          </div>
        </div>
      </div>

      <article className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <p className="text-base leading-relaxed">
          If you only have an hour for year-end, these 10 tips give
          you the biggest impact per minute. Each links to the
          specific Quikfinance screen so you can act immediately.
        </p>

        <TipRow
          n={1}
          title="Reconcile bank accounts in March, not April"
          body="Don't wait until after April 1. Pulling the March 31 statement on April 5 and reconciling immediately catches errors while they're still fixable. Open Banking → each account → Reconcile."
          href="/banking"
        />

        <TipRow
          n={2}
          title="Do a physical stock count"
          body="Walk the warehouse. Count what's actually there. Match against Stock Valuation as of Mar 31 — the differences (damage, theft, recount errors) are journal entries you'll post via Stock Adjustments."
          href="/reports/stock-valuation"
        />

        <TipRow
          n={3}
          title="Post depreciation FIRST, before any reports"
          body="If you generate P&L and BS before depreciation, the asset values are overstated and the period expense is missing. Always: depreciation → adjustments → reports."
          href="/accountant/manual-journals/new"
        />

        <TipRow
          n={4}
          title="Provision for bad debts"
          body="Run AR Aging. Any invoice 90+ days overdue with no realistic chance of collection should get a bad-debt provision via Manual Journal. Improves the realism of your AR and reduces taxable income."
          href="/reports/ar-aging"
        />

        <TipRow
          n={5}
          title="Reconcile GSTR-1 vs GSTR-3B"
          body="The two GST returns should agree on outward supply totals. If they differ, fix before March return is filed — mismatches trigger GST scrutiny notices."
          href="/reports/gstr1"
        />

        <TipRow
          n={6}
          title="Pay MSME vendors within 45 days"
          body="Outstanding balances to MSME vendors beyond 45 days are disallowed as deductions in your income-tax return. Run AP Aging filtered by MSME tag and clear them."
          href="/reports/ap-aging"
        />

        <TipRow
          n={7}
          title="File pending TDS returns"
          body="Form 26Q is quarterly. Make sure all four quarters are filed before year-end. Pending returns block the deduction of the corresponding expense."
          href="/reports"
        />

        <TipRow
          n={8}
          title="Update accountant access"
          body="Invite your CA via Settings → Users with the Accountant role. They can review the books directly instead of asking you to email reports."
          href="/settings/users"
        />

        <TipRow
          n={9}
          title="Roll over the invoice number prefix"
          body="On April 1, update Settings → Number Series so new invoices use the new FY prefix (e.g., INV-26-0001). Historical invoices keep their old numbers, which is correct."
          href="/settings/number-series"
        />

        <TipRow
          n={10}
          title="Export the year-end pack early"
          body="Don't wait for your accountant to ask. As soon as March is reconciled and adjusted, export Trial Balance, P&L, BS, Cash Flow + Schedule III versions to PDF/XLSX. Email everything to your CA in one go."
          href="/reports"
        />

        {/* Pro tips */}
        <section className="space-y-3 border-t pt-8 mt-10">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-600" />
            Pro tips
          </h2>
          <ul className="space-y-3 text-base leading-relaxed">
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Set up monthly close discipline.</strong> If
                you close your books monthly (reconcile + post any
                accruals on the 5th of every month), year-end
                becomes routine — not a panic.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>
                  Use Recurring Manual Journals for depreciation.
                </strong>{" "}
                Set monthly depreciation as a recurring journal so
                it auto-fires. No manual posting needed each period.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>
                  Schedule the year-end pack as emails.
                </strong>{" "}
                In the{" "}
                <Link
                  href="/reports"
                  className="text-primary hover:underline"
                >
                  Reports Center
                </Link>
                , set TB / P&amp;L / BS / CF to email your accountant
                monthly. They have a running view, not a March
                surprise.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                <strong>Lock the period (when feature ships).</strong>{" "}
                Once March is closed and the returns are filed, lock
                the period so accidental edits don&apos;t corrupt the
                audit trail. Until period locking ships, set
                non-Owner roles to read-only on closed FYs.
              </span>
            </li>
          </ul>
        </section>

        {/* Common mistakes */}
        <section className="space-y-3 border-t pt-8">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Avoid these common mistakes
          </h2>
          <ul className="space-y-2 text-base leading-relaxed">
            <li>
              Posting journals dated in the wrong fiscal year (the
              date determines which FY the entry hits — double-check)
            </li>
            <li>
              Forgetting opening balances when migrating from Tally
              (sets your books up for a balanced position)
            </li>
            <li>
              Skipping the Trial Balance check (it MUST balance to
              zero before you submit anything to your CA)
            </li>
            <li>
              Filing the income-tax return without reconciling
              26AS (the IT department&apos;s view of your TDS) — leads
              to refund delays or notices
            </li>
          </ul>
        </section>

        {/* Related */}
        <section className="space-y-3 border-t pt-8">
          <h2 className="text-base font-semibold">
            More year-end resources
          </h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link
                href="/help/year-end-closing-guide"
                className="text-primary hover:underline"
              >
                → The Ultimate Guide to Closing Your Books (10 min
                read)
              </Link>
            </li>
            <li>
              <Link
                href="/help/fiscal-year-end-tasks"
                className="text-primary hover:underline"
              >
                → All Year-End FAQs (8 questions answered)
              </Link>
            </li>
            <li>
              <Link
                href="/fiscal-year-end"
                className="text-primary hover:underline"
              >
                → Fiscal Year-End Tasks (interactive checklist)
              </Link>
            </li>
          </ul>
        </section>

        {/* Support footer */}
        <section className="border-t pt-8">
          <div className="rounded-lg border bg-blue-50/40 dark:bg-blue-950/10 p-5 flex items-start gap-4">
            <div className="h-10 w-10 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <FileBadge className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1 space-y-1">
              <h3 className="text-base font-semibold">
                Have a question we haven&apos;t covered?
              </h3>
              <p className="text-sm text-muted-foreground">
                Reach our support team — first reply within one
                business day.
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

function TipRow({
  n,
  title,
  body,
  href,
}: {
  n: number;
  title: string;
  body: string;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-4 rounded-lg border bg-background p-5">
      <div className="h-9 w-9 rounded-full bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0 text-sm font-semibold text-blue-700">
        {n}
      </div>
      <div className="flex-1 space-y-1.5">
        <h3 className="text-base font-semibold leading-tight">
          {title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {body}
        </p>
        {href ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline pt-1"
          >
            Open in Quikfinance
            <ChevronRight className="h-3 w-3" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
