import { format } from "date-fns";
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
import {
  buildProfitAndLoss,
  mergePnlWithCompare,
  type PnlSection,
  type PnlSectionWithCompare,
  type ProfitAndLossWithCompare,
} from "@/lib/reports/profit-loss";
import {
  parseCompareMode,
  computeCompareRange,
  pctChange,
  formatPctChange,
  compareRangeLabel,
  COMPARE_LABEL,
} from "@/lib/reports/compare";
import { getRecentReportActivity } from "@/lib/reports/activity";
import { getExistingSchedule } from "@/lib/reports/scheduled";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Profit and Loss" };

/**
 * Profit and Loss report.
 *
 *   Outer (ReportShell) header:
 *     "Business Overview · Profit and Loss · From DD/MM/YYYY To DD/MM/YYYY"
 *     with the date-range picker + Export dropdown + Refresh button.
 *
 *   Inner (centered card):
 *     Organization name · "Profit and Loss" title · Basis: Accrual ·
 *     Date range, then the hierarchical section table:
 *
 *     Operating Income       (INCOME accounts)
 *     Cost of Goods Sold     (COST_OF_GOODS_SOLD accounts)
 *     Gross Profit           (subtotal)
 *     Operating Expense      (EXPENSE accounts)
 *     Operating Profit       (subtotal)
 *     Non Operating Income   (OTHER_INCOME accounts)
 *     Non Operating Expense  (OTHER_EXPENSE accounts)
 *     Net Profit/Loss        (subtotal)
 */
export default async function ProfitLossPage({
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
  const compareMode = parseCompareMode(searchParams);

  const jeLines = await db.journalEntryLine.findMany({
    where: {
      journalEntry: {
        organizationId: organization.id,
        date: { gte: range.start, lte: range.end },
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

  const ledgerRows = aggregateLedgerLines(
    jeLines.map((l) => ({
      account: {
        id: l.account.id,
        name: l.account.name,
        code: l.account.code,
        type: l.account.type as AccountBucket,
      },
      debit: Number(l.debit),
      credit: Number(l.credit),
    }))
  );

  const pnl = buildProfitAndLoss(ledgerRows);
  const cur = organization.currency;

  // ── Compare-period fetch + merge (no DB calls when mode=none).
  let pnlCompare: ProfitAndLossWithCompare | null = null;
  let compareRangeText: string | null = null;
  if (compareMode !== "none") {
    const prevRange = computeCompareRange(range, compareMode);
    const prevJeLines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          organizationId: organization.id,
          date: { gte: prevRange.start, lte: prevRange.end },
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
    const prevLedger = aggregateLedgerLines(
      prevJeLines.map((l) => ({
        account: {
          id: l.account.id,
          name: l.account.name,
          code: l.account.code,
          type: l.account.type as AccountBucket,
        },
        debit: Number(l.debit),
        credit: Number(l.credit),
      }))
    );
    const prevPnl = buildProfitAndLoss(prevLedger);
    pnlCompare = mergePnlWithCompare(pnl, prevPnl);
    compareRangeText = compareRangeLabel(compareMode, prevRange);
  }

  // Pre-fetch the Report Activity timeline so the toolbar's drawer
  // opens instantly (no client-side fetch round-trip).
  const activityRows = await getRecentReportActivity(
    organization.id,
    "profit-and-loss",
    20
  );

  // Pre-fetch any existing scheduled-report row for this user.
  const existingSchedule = await getExistingSchedule({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "profit-and-loss",
  });

  const dateRangeText = `From ${format(range.start, "dd/MM/yyyy")} To ${format(
    range.end,
    "dd/MM/yyyy"
  )}`;

  // Preserve preset/from/to for the export route so the user gets
  // the same window in their download.
  const exportParams = new URLSearchParams({ preset });
  if (preset === "custom") {
    exportParams.set("from", format(range.start, "yyyy-MM-dd"));
    exportParams.set("to", format(range.end, "yyyy-MM-dd"));
  }

  return (
    <ReportShell
      title="Profit and Loss"
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
          reportKey="profit-and-loss"
          reportTitle="Profit and Loss"
          fiscalYearStartMonth={organization.fiscalYearStart}
          exportBaseUrl="/reports/profit-loss/export"
          exportParams={exportParams.toString()}
          columns={[
            { key: "showCode", label: "Account Code", defaultEnabled: true },
          ]}
          activityRows={activityRows}
          existingSchedule={existingSchedule}
        />
      }
    >
      <Card className="p-0 overflow-hidden">
        {/* Centered report header (org / title / basis / date range) */}
        <div className="text-center space-y-1 pt-8 pb-6">
          <div className="text-sm text-muted-foreground">
            {organization.name}
          </div>
          <h2 className="text-xl font-semibold">Profit and Loss</h2>
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
          <div className="text-sm text-muted-foreground tabular-nums">
            {dateRangeText}
          </div>
        </div>

        {/* Section table — switches between single-period and
            compare layout based on the URL ?compare= param. */}
        {pnlCompare ? (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-6 py-3 font-medium">Account</th>
                <th className="text-right px-6 py-3 font-medium w-40">
                  {dateRangeText.replace(/^From |To.*$/g, "")}
                </th>
                <th className="text-right px-6 py-3 font-medium w-40">
                  {compareRangeText ?? COMPARE_LABEL[compareMode]}
                </th>
                <th className="text-right px-6 py-3 font-medium w-28">
                  Change
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <SectionRowsCompare section={pnlCompare.operatingIncome} />
              <SectionRowsCompare section={pnlCompare.costOfGoodsSold} />
              <SubtotalRowCompare
                label="Gross Profit"
                amount={pnlCompare.grossProfit}
                previousAmount={pnlCompare.previousGrossProfit}
              />
              <SectionRowsCompare section={pnlCompare.operatingExpense} />
              <SubtotalRowCompare
                label="Operating Profit"
                amount={pnlCompare.operatingProfit}
                previousAmount={pnlCompare.previousOperatingProfit}
              />
              <SectionRowsCompare section={pnlCompare.nonOperatingIncome} />
              <SectionRowsCompare section={pnlCompare.nonOperatingExpense} />
              <SubtotalRowCompare
                label="Net Profit/Loss"
                amount={pnlCompare.netProfitLoss}
                previousAmount={pnlCompare.previousNetProfitLoss}
                emphasize
              />
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-6 py-3 font-medium">Account</th>
                <th className="text-right px-6 py-3 font-medium w-48">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <SectionRows section={pnl.operatingIncome} currency={cur} />
              <SectionRows section={pnl.costOfGoodsSold} currency={cur} />
              <SubtotalRow
                label="Gross Profit"
                amount={pnl.grossProfit}
                currency={cur}
              />
              <SectionRows section={pnl.operatingExpense} currency={cur} />
              <SubtotalRow
                label="Operating Profit"
                amount={pnl.operatingProfit}
                currency={cur}
              />
              <SectionRows section={pnl.nonOperatingIncome} currency={cur} />
              <SectionRows section={pnl.nonOperatingExpense} currency={cur} />
              <SubtotalRow
                label="Net Profit/Loss"
                amount={pnl.netProfitLoss}
                currency={cur}
                emphasize
              />
            </tbody>
          </table>
        )}

        {/* Currency footnote */}
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

/**
 * Render one report section: a bolded "Operating Income"-style group
 * header, one row per non-zero account beneath, then a "Total for X"
 * subtotal row. Matches the reference structure even when the section has
 * zero accounts (the total row still appears with 0.00).
 */
function SectionRows({
  section,
  currency,
}: {
  section: PnlSection;
  currency: string;
}) {
  return (
    <>
      <tr>
        <td className="px-6 py-3 font-semibold" colSpan={2}>
          {section.label}
        </td>
      </tr>
      {section.accounts.map((a) => (
        <tr key={a.accountId} className="hover:bg-muted/20">
          <td className="px-6 py-2.5 pl-10">
            {a.accountCode ? (
              <span className="font-mono text-xs text-muted-foreground mr-2">
                {a.accountCode}
              </span>
            ) : null}
            {a.accountName}
          </td>
          <td className="px-6 py-2.5 text-right tabular-nums">
            {formatPnlAmount(a.amount, currency)}
          </td>
        </tr>
      ))}
      <tr>
        <td className="px-6 py-2.5 pl-10 font-semibold">
          Total for {section.label}
        </td>
        <td className="px-6 py-2.5 text-right tabular-nums font-semibold">
          {formatPnlAmount(section.total, currency)}
        </td>
      </tr>
    </>
  );
}

/** Subtotal rows (Gross Profit / Operating Profit / Net Profit/Loss). */
function SubtotalRow({
  label,
  amount,
  currency,
  emphasize,
}: {
  label: string;
  amount: number;
  currency: string;
  emphasize?: boolean;
}) {
  return (
    <tr className={emphasize ? "bg-muted/40" : ""}>
      <td className="px-6 py-3 font-semibold">{label}</td>
      <td
        className={
          "px-6 py-3 text-right tabular-nums font-semibold " +
          (amount < 0 ? "text-destructive" : "")
        }
      >
        {formatPnlAmount(amount, currency)}
      </td>
    </tr>
  );
}

/** P&L number formatter — always 2 decimals, negatives as -123.45. */
function formatPnlAmount(n: number, currency: string): string {
  // Strip the currency symbol so the column reads as a pure
  // number — the badge in the footnote tells the reader the
  // currency. Matches the reference table style.
  void currency;
  if (Math.abs(n) < 0.005) return "0.00";
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-${abs}` : abs;
}

/** Keep the import used (formatMoney) actually referenced for future
 *  drill-down / per-account hover tooltips. */
void formatMoney;

// ─── Compare-period table renderers ──────────────────────────────

function SectionRowsCompare({ section }: { section: PnlSectionWithCompare }) {
  return (
    <>
      <tr>
        <td className="px-6 py-3 font-semibold" colSpan={4}>
          {section.label}
        </td>
      </tr>
      {section.accounts.map((a) => (
        <tr key={a.accountId} className="hover:bg-muted/20">
          <td className="px-6 py-2.5 pl-10">
            {a.accountCode ? (
              <span className="font-mono text-xs text-muted-foreground mr-2">
                {a.accountCode}
              </span>
            ) : null}
            {a.accountName}
          </td>
          <td className="px-6 py-2.5 text-right tabular-nums">
            {formatPnlAmount(a.amount, "")}
          </td>
          <td className="px-6 py-2.5 text-right tabular-nums text-muted-foreground">
            {formatPnlAmount(a.previousAmount, "")}
          </td>
          <PctChangeCell current={a.amount} previous={a.previousAmount} />
        </tr>
      ))}
      <tr>
        <td className="px-6 py-2.5 pl-10 font-semibold">
          Total for {section.label}
        </td>
        <td className="px-6 py-2.5 text-right tabular-nums font-semibold">
          {formatPnlAmount(section.total, "")}
        </td>
        <td className="px-6 py-2.5 text-right tabular-nums font-semibold text-muted-foreground">
          {formatPnlAmount(section.previousTotal, "")}
        </td>
        <PctChangeCell
          current={section.total}
          previous={section.previousTotal}
          bold
        />
      </tr>
    </>
  );
}

function SubtotalRowCompare({
  label,
  amount,
  previousAmount,
  emphasize,
}: {
  label: string;
  amount: number;
  previousAmount: number;
  emphasize?: boolean;
}) {
  return (
    <tr className={emphasize ? "bg-muted/40" : ""}>
      <td className="px-6 py-3 font-semibold">{label}</td>
      <td
        className={
          "px-6 py-3 text-right tabular-nums font-semibold " +
          (amount < 0 ? "text-destructive" : "")
        }
      >
        {formatPnlAmount(amount, "")}
      </td>
      <td className="px-6 py-3 text-right tabular-nums font-semibold text-muted-foreground">
        {formatPnlAmount(previousAmount, "")}
      </td>
      <PctChangeCell current={amount} previous={previousAmount} bold />
    </tr>
  );
}

function PctChangeCell({
  current,
  previous,
  bold,
}: {
  current: number;
  previous: number;
  bold?: boolean;
}) {
  const p = pctChange(current, previous);
  const label = formatPctChange(p);
  const colorCls =
    p === null
      ? "text-muted-foreground"
      : p >= 0
        ? "text-emerald-600"
        : "text-destructive";
  return (
    <td
      className={
        "px-6 py-2.5 text-right tabular-nums " +
        colorCls +
        (bold ? " font-semibold" : "")
      }
    >
      {label}
    </td>
  );
}
