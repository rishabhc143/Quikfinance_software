import Link from "next/link";
import {
  CalendarCheck,
  ArrowRight,
  Banknote,
  BookOpen,
  Calculator,
  FileSpreadsheet,
  FileText,
  Lock,
  TrendingDown,
} from "lucide-react";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Fiscal Year-End Tasks" };

/**
 * Fiscal Year-End Tasks — period-end closing checklist.
 *
 * Walks the accountant through the canonical steps to close a
 * fiscal year:
 *   1. Run Trial Balance to confirm every account has the
 *      expected balance
 *   2. Reconcile every bank account
 *   3. Post adjusting journals (depreciation, accruals, prepayments)
 *   4. Run final Profit & Loss
 *   5. Run final Balance Sheet
 *   6. Run final Cash Flow Statement
 *   7. Schedule III filings (P&L + BS in Companies Act format)
 *   8. Lock the period (Phase 2 — currently linked to a stub)
 *
 * Static checklist for v1. Phase 2 will add "tick when done" state
 * persisted to a new ClosingChecklist table.
 */
export default async function FiscalYearEndPage() {
  const { organization } = await requireOrganization();

  const fy = currentFiscalYearLabel(organization.fiscalYearStart);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-medium">
          <CalendarCheck className="h-3.5 w-3.5" />
          Period-End Workflow
        </div>
        <h1 className="text-2xl font-semibold">Fiscal Year-End Tasks</h1>
        <p className="text-sm text-muted-foreground">
          Close <span className="font-medium">{fy}</span> cleanly. Walk
          through these 8 steps in order. Each step links to the right
          page in Quikfinance — come back here to check off your next
          task.
        </p>
      </div>

      <Card className="p-0 divide-y">
        <TaskRow
          icon={BookOpen}
          step={1}
          label="Review the Trial Balance"
          description="Confirm every ledger account has the expected balance. Investigate any unfamiliar account or unusually large balance before closing."
          href="/reports/trial-balance"
          ctaLabel="Open Trial Balance"
        />
        <TaskRow
          icon={Banknote}
          step={2}
          label="Reconcile every Bank Account"
          description="Match every bank statement against your recorded ledger. Unreconciled banks distort Cash Flow and Balance Sheet."
          href="/banking"
          ctaLabel="Open Banking"
        />
        <TaskRow
          icon={TrendingDown}
          step={3}
          label="Post depreciation + adjusting journals"
          description="Run depreciation on fixed assets, post any accruals or prepayments. Use Manual Journal Entries for one-off adjustments."
          href="/accountant/manual-journals/new"
          ctaLabel="New Manual Journal"
        />
        <TaskRow
          icon={FileText}
          step={4}
          label="Run the final Profit and Loss"
          description="With all adjustments posted, generate the final P&L. Review by category — any line that looks wrong needs investigation before close."
          href="/reports/profit-loss"
          ctaLabel="Open P&L"
        />
        <TaskRow
          icon={FileSpreadsheet}
          step={5}
          label="Run the final Balance Sheet"
          description="Confirm Assets = Liabilities + Equity. Trade receivables/payables should match aging reports."
          href="/reports/balance-sheet"
          ctaLabel="Open Balance Sheet"
        />
        <TaskRow
          icon={Calculator}
          step={6}
          label="Run the final Cash Flow Statement"
          description="Compare beginning + ending cash against your bank reconciliations. The 3-section flow tells the story of where cash came from and went."
          href="/reports/cash-flow"
          ctaLabel="Open Cash Flow"
        />
        <TaskRow
          icon={FileText}
          step={7}
          label="Download Schedule III filings"
          description="Companies Act 2013 mandated formats for filing with MCA. Run P&L (Schedule III) and Balance Sheet (Schedule III), export as CSV, hand to your CA."
          href="/reports/profit-loss-schedule-iii"
          ctaLabel="Open Schedule III P&L"
          secondaryHref="/reports/balance-sheet-schedule-iii"
          secondaryLabel="Schedule III BS"
        />
        <TaskRow
          icon={Lock}
          step={8}
          label="Lock the period"
          description="Phase 2 — once enabled, locking the FY prevents back-dated entries from changing your filed numbers."
          href="/settings"
          ctaLabel="Coming soon"
          disabled
        />
      </Card>

      <div className="text-xs text-muted-foreground pt-2">
        Closing your books takes practice. Loop your CA in early so the
        Schedule III filings are reviewed before submission. Quikfinance
        doesn&apos;t replace professional advice — it makes the data
        flow easy.
      </div>
    </div>
  );
}

function TaskRow({
  icon: Icon,
  step,
  label,
  description,
  href,
  ctaLabel,
  secondaryHref,
  secondaryLabel,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  step: number;
  label: string;
  description: string;
  href: string;
  ctaLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-4 px-5 py-4">
      <div className="shrink-0 mt-0.5">
        <div className="relative">
          <div className="h-8 w-8 rounded-full border-2 border-primary/30 bg-primary/5 flex items-center justify-center">
            <span className="text-xs font-semibold text-primary">
              {step}
            </span>
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">{label}</h3>
          {disabled ? (
            <Badge variant="outline" className="text-[10px] uppercase">
              Phase 2
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          {description}
        </p>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <Button asChild size="sm" disabled={disabled} variant="outline">
          <Link href={href} className="gap-1">
            {ctaLabel}
            {disabled ? null : <ArrowRight className="h-3.5 w-3.5" />}
          </Link>
        </Button>
        {secondaryHref && secondaryLabel ? (
          <Button asChild size="sm" variant="ghost">
            <Link
              href={secondaryHref}
              className="gap-1 text-xs text-muted-foreground"
            >
              {secondaryLabel}
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** "Apr 2026 — Mar 2027" style label based on the org's FY start month. */
function currentFiscalYearLabel(startMonth: number): string {
  const now = new Date();
  const currentMonth = now.getUTCMonth() + 1;
  const currentYear = now.getUTCFullYear();
  const fyStartYear =
    currentMonth >= startMonth ? currentYear : currentYear - 1;
  const fyStart = new Date(Date.UTC(fyStartYear, startMonth - 1, 1));
  const fyEnd = new Date(Date.UTC(fyStartYear + 1, startMonth - 1, 0));
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  return `${fmt(fyStart)} — ${fmt(fyEnd)}`;
}
