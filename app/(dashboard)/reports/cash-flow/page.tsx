import Link from "next/link";
import { format } from "date-fns";
import { Filter } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportShell } from "@/components/reports/report-shell";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { parseRangeFromSearchParams } from "@/lib/reports/date-range";
import {
  aggregateLedgerLines,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import {
  buildCashFlowStatement,
  isCashAccount,
  type CashFlowAccountDelta,
} from "@/lib/reports/cash-flow";
import { getRecentReportActivity } from "@/lib/reports/activity";
import { getExistingSchedule } from "@/lib/reports/scheduled";

export const metadata = { title: "Cash Flow Statement" };

/**
 * Zoho-style Cash Flow Statement — indirect method.
 *
 *   Beginning Cash Balance
 *   Cash Flow from Operating Activities
 *     Net Income (linked to P&L for the same period)
 *     Non-cash adjustments
 *       Δ <each working-capital account>
 *     Non-cash adjustments Total
 *     Net cash provided by Operating Activities
 *   Cash Flow from Investing Activities
 *     Δ <each non-current asset>
 *     Net cash provided by Investing Activities
 *   Cash Flow from Financing Activities
 *     Δ <each non-current liability or equity account>
 *     Net cash provided by Financing Activities
 *   Net Change in cash
 *   Ending Cash Balance
 *
 * Math lives in `lib/reports/cash-flow.ts`. The page is responsible
 * for the period-bounded JE queries:
 *   - Beginning cash = (debit − credit) sums for cash/bank accounts
 *     where journalEntry.date < range.start
 *   - Period activity = (debit − credit) sums for every account
 *     where journalEntry.date is in [start, end]
 *   - Net Income = sum of (credit − debit) for credit-natural P&L
 *     accounts (Income, Other Income) + sum of (debit − credit) for
 *     debit-natural P&L accounts (Expense, COGS, Other Expense)
 *
 * Ending cash = Beginning + (period delta on cash/bank).
 */
export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Record<string, string>;
}) {
  const { organization, user } = await requireOrganization();
  const { range, preset } = parseRangeFromSearchParams(searchParams, {
    fiscalYearStartMonth: organization.fiscalYearStart,
    defaultPreset: "this-month",
  });

  const accounts = await db.chartOfAccount.findMany({
    where: { organizationId: organization.id, isActive: true },
    select: {
      id: true,
      name: true,
      code: true,
      type: true,
      subType: true,
    },
  });
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const cashAccountIds = accounts
    .filter((a) => isCashAccount(a.type as AccountBucket, a.subType))
    .map((a) => a.id);

  const [beforeLines, periodLines] = await Promise.all([
    cashAccountIds.length > 0
      ? db.journalEntryLine.findMany({
          where: {
            accountId: { in: cashAccountIds },
            journalEntry: {
              organizationId: organization.id,
              date: { lt: range.start },
            },
          },
          select: { debit: true, credit: true, accountId: true },
        })
      : Promise.resolve(
          [] as Array<{ debit: unknown; credit: unknown; accountId: string }>
        ),
    db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          organizationId: organization.id,
          date: { gte: range.start, lte: range.end },
        },
      },
      select: {
        debit: true,
        credit: true,
        account: {
          select: { id: true, name: true, code: true, type: true },
        },
      },
    }),
  ]);

  const beginningCashBalance = beforeLines.reduce(
    (s, l) => s + Number(l.debit) - Number(l.credit),
    0
  );

  const ledger = aggregateLedgerLines(
    periodLines.map((l) => ({
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

  let netIncome = 0;
  for (const r of ledger) {
    if (r.accountType === "INCOME" || r.accountType === "OTHER_INCOME") {
      netIncome += r.totalCredit - r.totalDebit;
    } else if (
      r.accountType === "EXPENSE" ||
      r.accountType === "COST_OF_GOODS_SOLD" ||
      r.accountType === "OTHER_EXPENSE"
    ) {
      netIncome -= r.totalDebit - r.totalCredit;
    }
  }

  const nonCashDeltas: CashFlowAccountDelta[] = ledger
    .filter((r) => {
      if (
        r.accountType === "INCOME" ||
        r.accountType === "OTHER_INCOME" ||
        r.accountType === "EXPENSE" ||
        r.accountType === "COST_OF_GOODS_SOLD" ||
        r.accountType === "OTHER_EXPENSE"
      ) {
        return false;
      }
      const a = accountById.get(r.accountId);
      if (!a) return false;
      return !isCashAccount(a.type as AccountBucket, a.subType);
    })
    .map((r) => {
      const a = accountById.get(r.accountId)!;
      return {
        accountId: r.accountId,
        accountName: r.accountName,
        accountCode: r.accountCode,
        accountType: a.type as AccountBucket,
        accountSubType: a.subType,
        rawDelta: r.totalDebit - r.totalCredit,
      };
    });

  const cashPeriodDelta = ledger
    .filter((r) => {
      const a = accountById.get(r.accountId);
      return a ? isCashAccount(a.type as AccountBucket, a.subType) : false;
    })
    .reduce((s, r) => s + (r.totalDebit - r.totalCredit), 0);
  const endingCashBalance = beginningCashBalance + cashPeriodDelta;

  const cf = buildCashFlowStatement({
    beginningCashBalance,
    endingCashBalance,
    netIncome,
    nonCashDeltas,
  });

  const cur = organization.currency;
  const dateRangeText = `From ${format(range.start, "dd/MM/yyyy")} To ${format(range.end, "dd/MM/yyyy")}`;
  const exportParams = new URLSearchParams({ preset });
  if (preset === "custom") {
    exportParams.set("from", format(range.start, "yyyy-MM-dd"));
    exportParams.set("to", format(range.end, "yyyy-MM-dd"));
  }

  // Pre-fetch the Report Activity timeline for the toolbar's drawer.
  const activityRows = await getRecentReportActivity(
    organization.id,
    "cash-flow-statement",
    20
  );
  const existingSchedule = await getExistingSchedule({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "cash-flow-statement",
  });

  return (
    <ReportShell
      title="Cash Flow Statement"
      subtitle={
        <span className="flex items-center gap-1.5">
          <span className="text-muted-foreground">Business Overview</span>
          <span className="text-muted-foreground">•</span>
          <span>{dateRangeText}</span>
        </span>
      }
      actions={
        <ReportToolbar
          reportKey="cash-flow-statement"
          reportTitle="Cash Flow Statement"
          fiscalYearStartMonth={organization.fiscalYearStart}
          exportBaseUrl="/reports/cash-flow/export"
          exportParams={exportParams.toString()}
          activityRows={activityRows}
          existingSchedule={existingSchedule}
        />
      }
    >
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Filter className="h-3 w-3" />
          <span className="uppercase tracking-wider">Filters :</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Date Range :</span>
          <DateRangePicker
            activePreset={preset}
            activeRange={range}
            fiscalYearStartMonth={organization.fiscalYearStart}
          />
        </div>
        <Button variant="outline" size="sm" disabled>
          + More Filters
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="text-center space-y-1 pt-8 pb-6">
          <div className="text-sm text-muted-foreground">
            {organization.name}
          </div>
          <h2 className="text-xl font-semibold">Cash Flow Statement</h2>
          <div className="text-sm text-muted-foreground tabular-nums">
            {dateRangeText}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-6 py-3 font-medium">Account</th>
              <th className="text-right px-6 py-3 font-medium w-48">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <Row
              label="Beginning Cash Balance"
              amount={cf.beginningCashBalance}
              boldLabel
            />

            <SectionHeader label="Cash Flow from Operating Activities" />
            <Row
              label={
                <Link
                  href={`/reports/profit-loss?${exportParams.toString()}`}
                  className="text-primary hover:underline"
                >
                  Net Income
                </Link>
              }
              amount={cf.operating.netIncome}
              indent={1}
            />
            <SectionHeader label="Non-cash adjustments" indent={1} />
            {cf.operating.nonCashAdjustments.map((adj) => (
              <Row
                key={adj.label}
                label={adj.label}
                amount={adj.amount}
                indent={2}
              />
            ))}
            <Row
              label="Non-cash adjustments Total"
              amount={cf.operating.nonCashAdjustmentsTotal}
              indent={1}
              boldLabel
            />
            <Row
              label="Net cash provided by Operating Activities"
              amount={cf.operating.netCashFromOperating}
              boldLabel
              emphasize
            />

            <SectionHeader label="Cash Flow from Investing Activities" />
            {cf.investing.items.map((it) => (
              <Row
                key={it.label}
                label={it.label}
                amount={it.amount}
                indent={1}
              />
            ))}
            <Row
              label="Net cash provided by Investing Activities"
              amount={cf.investing.netCashFromInvesting}
              boldLabel
              emphasize
            />

            <SectionHeader label="Cash Flow from Financing Activities" />
            {cf.financing.items.map((it) => (
              <Row
                key={it.label}
                label={it.label}
                amount={it.amount}
                indent={1}
              />
            ))}
            <Row
              label="Net cash provided by Financing Activities"
              amount={cf.financing.netCashFromFinancing}
              boldLabel
              emphasize
            />

            <Row
              label="Net Change in cash"
              amount={cf.netChangeInCash}
              boldLabel
            />
            <Row
              label="Ending Cash Balance"
              amount={cf.endingCashBalance}
              boldLabel
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

function SectionHeader({
  label,
  indent = 0,
}: {
  label: string;
  indent?: number;
}) {
  return (
    <tr>
      <td
        className="py-3 font-semibold"
        colSpan={2}
        style={{ paddingLeft: `${1.5 + indent * 1.5}rem` }}
      >
        {label}
      </td>
    </tr>
  );
}

function Row({
  label,
  amount,
  indent = 0,
  boldLabel,
  emphasize,
}: {
  label: React.ReactNode;
  amount: number;
  indent?: number;
  boldLabel?: boolean;
  emphasize?: boolean;
}) {
  return (
    <tr className={emphasize ? "bg-muted/40" : "hover:bg-muted/20"}>
      <td
        className={"py-3 " + (boldLabel ? "font-semibold" : "")}
        style={{ paddingLeft: `${1.5 + indent * 1.5}rem` }}
      >
        {label}
      </td>
      <td
        className={
          "px-6 py-3 text-right tabular-nums " +
          (boldLabel ? "font-semibold " : "") +
          (amount < 0 ? "text-destructive" : "")
        }
      >
        {fmtAmount(amount)}
      </td>
    </tr>
  );
}

function fmtAmount(n: number): string {
  if (Math.abs(n) < 0.005) return "0.00";
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-${abs}` : abs;
}
