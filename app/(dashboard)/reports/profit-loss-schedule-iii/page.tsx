import { format, subMonths, endOfMonth, startOfMonth } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportShell } from "@/components/reports/report-shell";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { ReportFilterStrip } from "@/components/reports/report-filter-strip";
import { ReportBasisDropdown } from "@/components/reports/report-basis-dropdown";
import {
  parseReportBasis,
  REPORT_BASIS_LABEL,
} from "@/lib/reports/report-basis";
import { parseRangeFromSearchParams } from "@/lib/reports/date-range";
import {
  aggregateLedgerLines,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import { buildScheduleIIIPnl } from "@/lib/reports/profit-loss-schedule-iii";
import { getRecentReportActivity } from "@/lib/reports/activity";
import { getExistingSchedule } from "@/lib/reports/scheduled";

export const metadata = { title: "Profit and Loss (Schedule III)" };

/**
 * REPORTS — Profit and Loss (Schedule III).
 *
 * The Companies Act 2013 mandated Indian P&L format. Renders the
 * 15 Roman-numeraled sections matching the user-supplied
 * screenshot, and *always* shows a side-by-side previous-month
 * column (Schedule III is comparative by default — Note 1 in the
 * Schedule itself requires comparative figures).
 *
 * Routing: `/reports/profit-loss-schedule-iii`
 * Catalog key: `profit-and-loss-schedule-iii`
 */
export default async function ProfitLossScheduleIIIPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const { organization, user } = await requireOrganization();
  const { range, preset } = parseRangeFromSearchParams(searchParams, {
    fiscalYearStartMonth: organization.fiscalYearStart,
    defaultPreset: "this-month",
  });
  const basis = parseReportBasis(searchParams);

  // Schedule III always shows previous-period as a second column.
  // We use a calendar-month shift so even custom ranges get the
  // sensible "prior month" comparison.
  const prevRangeStart = startOfMonth(subMonths(range.start, 1));
  const prevRangeEnd = endOfMonth(subMonths(range.end, 1));

  // Fetch both periods' P&L ledger entries in parallel.
  // Wrapped in a try/catch so DB failures surface as a structured
  // log entry (visible in Vercel function logs) rather than an
  // opaque Server Components render error.
  let currentPnl;
  let previousPnl;
  try {
    const [currentLines, previousLines] = await Promise.all([
      fetchPnlLines(organization.id, range.start, range.end),
      fetchPnlLines(organization.id, prevRangeStart, prevRangeEnd),
    ]);
    const currentLedger = aggregateLedgerLines(currentLines);
    const previousLedger = aggregateLedgerLines(previousLines);
    currentPnl = buildScheduleIIIPnl(currentLedger);
    previousPnl = buildScheduleIIIPnl(previousLedger);
  } catch (err) {
    console.error(
      "[reports/profit-loss-schedule-iii] failed to fetch/build ledger data",
      {
        orgId: organization.id,
        currentRange: { start: range.start.toISOString(), end: range.end.toISOString() },
        prevRange: {
          start: prevRangeStart.toISOString(),
          end: prevRangeEnd.toISOString(),
        },
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }
    );
    throw err;
  }
  const cur = organization.currency;

  // Activity timeline + existing schedule for the toolbar.
  const activityRows = await getRecentReportActivity(
    organization.id,
    "profit-and-loss-schedule-iii",
    20
  );
  const existingSchedule = await getExistingSchedule({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "profit-and-loss-schedule-iii",
  });

  const dateRangeText = `From ${format(range.start, "dd/MM/yyyy")} To ${format(
    range.end,
    "dd/MM/yyyy"
  )}`;
  const currentColLabel = format(range.start, "MMM yyyy").toUpperCase();
  const previousColLabel = format(prevRangeStart, "MMM yyyy").toUpperCase();

  const exportParams = new URLSearchParams({ preset });
  if (preset === "custom") {
    exportParams.set("from", format(range.start, "yyyy-MM-dd"));
    exportParams.set("to", format(range.end, "yyyy-MM-dd"));
  }

  return (
    <ReportShell
      title="Profit and Loss (Schedule III)"
      subtitle={
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Business Overview</span>
          <span className="text-muted-foreground">•</span>
          <span>{dateRangeText}</span>
        </span>
      }
      range={
        <ReportFilterStrip>
          <DateRangePicker
            activePreset={preset}
            activeRange={range}
            fiscalYearStartMonth={organization.fiscalYearStart}
          />
          <ReportBasisDropdown defaultBasis={basis} />
        </ReportFilterStrip>
      }
      actions={
        <ReportToolbar
          reportKey="profit-and-loss-schedule-iii"
          reportTitle="Profit and Loss (Schedule III)"
          fiscalYearStartMonth={organization.fiscalYearStart}
          exportBaseUrl="/reports/profit-loss-schedule-iii/export"
          exportParams={exportParams.toString()}
          activityRows={activityRows}
          existingSchedule={existingSchedule}
        />
      }
    >
      <Card className="p-0 overflow-hidden">
        <div className="text-center space-y-1 pt-8 pb-6">
          <div className="text-sm text-muted-foreground">
            {organization.name}
          </div>
          <h2 className="text-xl font-semibold">
            Profit and Loss (Schedule III)
          </h2>
          <div className="text-sm">
            <span className="text-muted-foreground">Basis</span>
            <span className="mx-1.5">:</span>
            <span>{REPORT_BASIS_LABEL[basis]}</span>
            {basis === "cash" ? (
              <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-600">
                beta — same data as accrual for now
              </span>
            ) : null}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-6 py-3 font-medium">Particulars</th>
              <th className="text-right px-6 py-3 font-medium w-24">
                Note No.
              </th>
              <th className="text-right px-6 py-3 font-medium w-32">
                {currentColLabel}
              </th>
              <th className="text-right px-6 py-3 font-medium w-32">
                {previousColLabel}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <Row
              roman="I."
              label="Revenue from operations"
              curr={currentPnl.revenueFromOperations}
              prev={previousPnl.revenueFromOperations}
              bold
            />
            <Row
              roman="II."
              label="Other Income"
              curr={currentPnl.otherIncome}
              prev={previousPnl.otherIncome}
              bold
            />
            <Row
              roman="III."
              label="Total Revenue (I + II)"
              curr={currentPnl.totalRevenue}
              prev={previousPnl.totalRevenue}
              bold
            />
            <Row
              roman="IV."
              label="Expenses"
              curr={currentPnl.expenses.total}
              prev={previousPnl.expenses.total}
              bold
            />
            <SubRow
              num="1."
              label="Cost of materials consumed"
              curr={currentPnl.expenses.costOfMaterialsConsumed}
              prev={previousPnl.expenses.costOfMaterialsConsumed}
            />
            <SubRow
              num="2."
              label="Purchases of stock in trade"
              curr={currentPnl.expenses.purchasesOfStockInTrade}
              prev={previousPnl.expenses.purchasesOfStockInTrade}
            />
            <SubRow
              num="3."
              label="Changes in Inventories of finished goods work-in-progress and Stock-in-trade"
              curr={currentPnl.expenses.changesInInventories}
              prev={previousPnl.expenses.changesInInventories}
            />
            <SubRow
              num="4."
              label="Employee benefits expense"
              curr={currentPnl.expenses.employeeBenefits}
              prev={previousPnl.expenses.employeeBenefits}
            />
            <SubRow
              num="5."
              label="Finance Costs"
              curr={currentPnl.expenses.financeCosts}
              prev={previousPnl.expenses.financeCosts}
            />
            <SubRow
              num="6."
              label="Depreciation And Amortization Expense"
              curr={currentPnl.expenses.depreciationAndAmortization}
              prev={previousPnl.expenses.depreciationAndAmortization}
            />
            <SubRow
              num="7."
              label="Other Expenses"
              curr={currentPnl.expenses.otherExpenses}
              prev={previousPnl.expenses.otherExpenses}
            />
            <Row
              roman="V."
              label="Profit before exceptional and extraordinary items and tax (III - IV)"
              curr={currentPnl.profitBeforeExceptionalAndExtraordinary}
              prev={previousPnl.profitBeforeExceptionalAndExtraordinary}
              bold
            />
            <Row
              roman="VI."
              label="Exceptional Items"
              curr={currentPnl.exceptionalItems}
              prev={previousPnl.exceptionalItems}
              bold
            />
            <Row
              roman="VII."
              label="Profit before extraordinary items and tax (V-VI)"
              curr={currentPnl.profitBeforeExtraordinary}
              prev={previousPnl.profitBeforeExtraordinary}
              bold
            />
            <Row
              roman="VIII."
              label="Extraordinary Items"
              curr={currentPnl.extraordinaryItems}
              prev={previousPnl.extraordinaryItems}
              bold
            />
            <Row
              roman="IX."
              label="Profit before tax (VII - VIII)"
              curr={currentPnl.profitBeforeTax}
              prev={previousPnl.profitBeforeTax}
              bold
            />
            <Row
              roman="X."
              label="Tax Expense"
              curr={currentPnl.taxExpense.total}
              prev={previousPnl.taxExpense.total}
              bold
            />
            <SubRow
              num="1."
              label="Current tax"
              curr={currentPnl.taxExpense.currentTax}
              prev={previousPnl.taxExpense.currentTax}
              isLink
            />
            <SubRow
              num="2."
              label="Deferred tax"
              curr={currentPnl.taxExpense.deferredTax}
              prev={previousPnl.taxExpense.deferredTax}
            />
            <Row
              roman="XI."
              label="Profit (Loss) for the period from continuing operations (IX - X)"
              curr={currentPnl.profitFromContinuingOperations}
              prev={previousPnl.profitFromContinuingOperations}
              bold
            />
            <Row
              roman="XII."
              label="Profit (Loss) from discontinuing operations"
              curr={currentPnl.profitFromDiscontinuingOperations}
              prev={previousPnl.profitFromDiscontinuingOperations}
              bold
            />
            <Row
              roman="XIII."
              label="Tax expense of discontinuing operations"
              curr={currentPnl.taxOfDiscontinuingOperations}
              prev={previousPnl.taxOfDiscontinuingOperations}
              bold
            />
            <Row
              roman="XIV."
              label="Profit (Loss) from Discontinuing operations (after tax) (XII - XIII)"
              curr={currentPnl.profitFromDiscontinuingAfterTax}
              prev={previousPnl.profitFromDiscontinuingAfterTax}
              bold
            />
            <Row
              roman="XV."
              label="Profit (Loss) for the period (XI + XIV)"
              curr={currentPnl.profitForPeriod}
              prev={previousPnl.profitForPeriod}
              bold
              emphasize
            />
          </tbody>
        </table>

        <div className="text-xs text-muted-foreground px-6 py-4 flex items-center gap-2">
          ** Amount is displayed in your base currency
          <Badge className="bg-emerald-600 hover:bg-emerald-600 text-[10px] uppercase tracking-wider">
            {cur}
          </Badge>
        </div>
      </Card>
    </ReportShell>
  );
}

async function fetchPnlLines(
  organizationId: string,
  from: Date,
  to: Date
) {
  const lines = await db.journalEntryLine.findMany({
    where: {
      journalEntry: {
        organizationId,
        date: { gte: from, lte: to },
      },
      account: {
        type: {
          in: [
            "INCOME",
            "OTHER_INCOME",
            "EXPENSE",
            "COST_OF_GOODS_SOLD",
            "OTHER_EXPENSE",
          ],
        },
      },
    },
    select: {
      debit: true,
      credit: true,
      account: {
        select: { id: true, name: true, code: true, type: true },
      },
    },
  });
  return lines.map((l) => ({
    account: {
      id: l.account.id,
      name: l.account.name,
      code: l.account.code,
      type: l.account.type as AccountBucket,
    },
    debit: Number(l.debit),
    credit: Number(l.credit),
  }));
}

/**
 * One top-level Schedule III row (Roman-numeraled). Renders the
 * particular's label, the note-number cell (blank for v1; later
 * versions can link to per-line schedules), and the two period
 * amount columns.
 */
function Row({
  roman,
  label,
  curr,
  prev,
  bold,
  emphasize,
}: {
  roman: string;
  label: string;
  curr: number;
  prev: number;
  bold?: boolean;
  emphasize?: boolean;
}) {
  return (
    <tr
      className={emphasize ? "bg-muted/40" : ""}
    >
      <td
        className={
          "px-6 py-2.5 " + (bold ? "font-semibold" : "text-foreground")
        }
      >
        <span className="mr-2">{roman}</span>
        {label}
      </td>
      <td className="px-6 py-2.5 text-right text-xs text-muted-foreground"></td>
      <td
        className={
          "px-6 py-2.5 text-right tabular-nums " +
          (bold ? "font-semibold" : "") +
          (curr < 0 ? " text-destructive" : "")
        }
      >
        {fmt(curr)}
      </td>
      <td
        className={
          "px-6 py-2.5 text-right tabular-nums " +
          (bold ? "font-semibold" : "text-muted-foreground") +
          (prev < 0 ? " text-destructive" : "")
        }
      >
        {fmt(prev)}
      </td>
    </tr>
  );
}

/** Indented sub-row under Expenses / Tax Expense. */
function SubRow({
  num,
  label,
  curr,
  prev,
  isLink,
}: {
  num: string;
  label: string;
  curr: number;
  prev: number;
  isLink?: boolean;
}) {
  return (
    <tr className="hover:bg-muted/20">
      <td className="px-6 py-2.5 pl-14">
        <span
          className={
            "mr-2 " + (isLink ? "text-primary" : "text-muted-foreground")
          }
        >
          {num}
        </span>
        <span className={isLink ? "text-primary" : ""}>{label}</span>
      </td>
      <td className="px-6 py-2.5 text-right text-xs text-muted-foreground"></td>
      <td
        className={
          "px-6 py-2.5 text-right tabular-nums " +
          (curr < 0 ? "text-destructive" : "")
        }
      >
        {fmt(curr)}
      </td>
      <td
        className={
          "px-6 py-2.5 text-right tabular-nums text-muted-foreground " +
          (prev < 0 ? "text-destructive" : "")
        }
      >
        {fmt(prev)}
      </td>
    </tr>
  );
}

function fmt(n: number): string {
  if (Math.abs(n) < 0.005) return "0.00";
  const abs = Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-${abs}` : abs;
}

// (ScheduleIIIPnl type-only import is used by inference above; no
//  runtime reference needed.)
