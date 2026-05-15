import { format, subMonths, endOfMonth, startOfMonth } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  aggregateLedgerLines,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import { buildScheduleIIIPnl } from "@/lib/reports/profit-loss-schedule-iii";
import {
  toCsv,
  csvResponse,
  csvDateSuffix,
  type CsvRow,
} from "@/lib/reports/csv-export";
import { parseRangeFromSearchParams } from "@/lib/reports/date-range";
import { logReportActivity } from "@/lib/reports/activity";

/**
 * REPORTS — Export endpoint for the Profit and Loss (Schedule III).
 *
 *   ?format=csv (default) — flat 4-column dump:
 *     section / particulars / current / previous
 *
 * XLSX + PDF are queued as follow-ups; CSV is the minimum honest
 * export so the user isn't stuck downloading nothing.
 */
export async function GET(req: Request) {
  const { organization, user } = await requireOrganization();
  const url = new URL(req.url);
  const fmt = url.searchParams.get("format") === "csv" ? "csv" : "csv";
  // Note: xlsx + pdf coming in follow-up PR. Default to CSV either way.

  const params = Object.fromEntries(url.searchParams.entries());
  const { range } = parseRangeFromSearchParams(params, {
    fiscalYearStartMonth: organization.fiscalYearStart,
    defaultPreset: "this-month",
  });

  // Same prev-period math as the page.
  const prevStart = startOfMonth(subMonths(range.start, 1));
  const prevEnd = endOfMonth(subMonths(range.end, 1));

  const [currentLines, previousLines] = await Promise.all([
    fetchPnlLines(organization.id, range.start, range.end),
    fetchPnlLines(organization.id, prevStart, prevEnd),
  ]);

  const currentPnl = buildScheduleIIIPnl(aggregateLedgerLines(currentLines));
  const previousPnl = buildScheduleIIIPnl(aggregateLedgerLines(previousLines));

  const currentLabel = format(range.start, "MMM yyyy");
  const previousLabel = format(prevStart, "MMM yyyy");
  const filenameStub = `profit-loss-schedule-iii-${csvDateSuffix(range.start)}`;

  void logReportActivity({
    organizationId: organization.id,
    userId: user.id,
    reportKey: "profit-and-loss-schedule-iii",
    eventType: "EXPORT_CSV",
    eventData: { format: "CSV", filename: `${filenameStub}.csv` },
  });

  const rows: CsvRow[] = [
    {
      particulars: "Particulars",
      current: currentLabel,
      previous: previousLabel,
    },
    line("I. Revenue from operations", currentPnl.revenueFromOperations, previousPnl.revenueFromOperations),
    line("II. Other Income", currentPnl.otherIncome, previousPnl.otherIncome),
    line("III. Total Revenue (I + II)", currentPnl.totalRevenue, previousPnl.totalRevenue),
    line("IV. Expenses", currentPnl.expenses.total, previousPnl.expenses.total),
    sub("1. Cost of materials consumed", currentPnl.expenses.costOfMaterialsConsumed, previousPnl.expenses.costOfMaterialsConsumed),
    sub("2. Purchases of stock in trade", currentPnl.expenses.purchasesOfStockInTrade, previousPnl.expenses.purchasesOfStockInTrade),
    sub("3. Changes in Inventories", currentPnl.expenses.changesInInventories, previousPnl.expenses.changesInInventories),
    sub("4. Employee benefits expense", currentPnl.expenses.employeeBenefits, previousPnl.expenses.employeeBenefits),
    sub("5. Finance Costs", currentPnl.expenses.financeCosts, previousPnl.expenses.financeCosts),
    sub("6. Depreciation And Amortization Expense", currentPnl.expenses.depreciationAndAmortization, previousPnl.expenses.depreciationAndAmortization),
    sub("7. Other Expenses", currentPnl.expenses.otherExpenses, previousPnl.expenses.otherExpenses),
    line("V. Profit before exceptional and extraordinary items and tax", currentPnl.profitBeforeExceptionalAndExtraordinary, previousPnl.profitBeforeExceptionalAndExtraordinary),
    line("VI. Exceptional Items", currentPnl.exceptionalItems, previousPnl.exceptionalItems),
    line("VII. Profit before extraordinary items and tax", currentPnl.profitBeforeExtraordinary, previousPnl.profitBeforeExtraordinary),
    line("VIII. Extraordinary Items", currentPnl.extraordinaryItems, previousPnl.extraordinaryItems),
    line("IX. Profit before tax", currentPnl.profitBeforeTax, previousPnl.profitBeforeTax),
    line("X. Tax Expense", currentPnl.taxExpense.total, previousPnl.taxExpense.total),
    sub("1. Current tax", currentPnl.taxExpense.currentTax, previousPnl.taxExpense.currentTax),
    sub("2. Deferred tax", currentPnl.taxExpense.deferredTax, previousPnl.taxExpense.deferredTax),
    line("XI. Profit (Loss) from continuing operations", currentPnl.profitFromContinuingOperations, previousPnl.profitFromContinuingOperations),
    line("XII. Profit (Loss) from discontinuing operations", currentPnl.profitFromDiscontinuingOperations, previousPnl.profitFromDiscontinuingOperations),
    line("XIII. Tax expense of discontinuing operations", currentPnl.taxOfDiscontinuingOperations, previousPnl.taxOfDiscontinuingOperations),
    line("XIV. Profit (Loss) from Discontinuing operations (after tax)", currentPnl.profitFromDiscontinuingAfterTax, previousPnl.profitFromDiscontinuingAfterTax),
    line("XV. Profit (Loss) for the period", currentPnl.profitForPeriod, previousPnl.profitForPeriod),
  ];

  void fmt;
  return csvResponse(`${filenameStub}.csv`, toCsv(rows));
}

function line(label: string, c: number, p: number): CsvRow {
  return { particulars: label, current: c, previous: p };
}
function sub(label: string, c: number, p: number): CsvRow {
  return { particulars: `    ${label}`, current: c, previous: p };
}

async function fetchPnlLines(
  organizationId: string,
  from: Date,
  to: Date
) {
  const lines = await db.journalEntryLine.findMany({
    where: {
      journalEntry: { organizationId, date: { gte: from, lte: to } },
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
      account: { select: { id: true, name: true, code: true, type: true } },
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
