import { startOfYear, endOfYear } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import {
  aggregateLedgerLines,
  sumByBucket,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";
import {
  toCsv,
  csvResponse,
  csvDateSuffix,
  type CsvRow,
} from "@/lib/reports/csv-export";

/**
 * RPT-A — CSV export for the Profit & Loss report. Same queries as
 * the page, returned as a flat row list rather than nested tables.
 *
 * Filename: profit-loss-{from}-{to}.csv
 */
export async function GET(req: Request) {
  const { organization } = await requireOrganization();
  const url = new URL(req.url);
  const now = new Date();
  const from = url.searchParams.get("from")
    ? new Date(url.searchParams.get("from")!)
    : startOfYear(now);
  const to = url.searchParams.get("to")
    ? new Date(url.searchParams.get("to")!)
    : endOfYear(now);

  const [paidInvoices, expenses, openInvoices, jeLines] = await Promise.all([
    db.invoice.aggregate({
      where: {
        organizationId: organization.id,
        deletedAt: null,
        status: "PAID",
        issueDate: { gte: from, lte: to },
      },
      _sum: { total: true },
    }),
    db.expense.findMany({
      where: {
        organizationId: organization.id,
        date: { gte: from, lte: to },
        deletedAt: null,
      },
      select: { category: true, amount: true },
    }),
    db.invoice.aggregate({
      where: {
        organizationId: organization.id,
        deletedAt: null,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        issueDate: { gte: from, lte: to },
      },
      _sum: { total: true },
    }),
    db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          organizationId: organization.id,
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
        account: { select: { id: true, name: true, code: true, type: true } },
      },
    }),
  ]);

  const revenue = Number(paidInvoices._sum.total ?? 0);
  const accruedRevenue = Number(openInvoices._sum.total ?? 0);

  const expenseByCategory = expenses.reduce<Record<string, number>>(
    (acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
      return acc;
    },
    {}
  );

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
  const buckets = sumByBucket(ledgerRows);
  const ledgerIncome =
    buckets.INCOME.totalCredit -
    buckets.INCOME.totalDebit +
    (buckets.OTHER_INCOME.totalCredit - buckets.OTHER_INCOME.totalDebit);
  const ledgerExpense =
    buckets.EXPENSE.totalDebit -
    buckets.EXPENSE.totalCredit +
    (buckets.COST_OF_GOODS_SOLD.totalDebit -
      buckets.COST_OF_GOODS_SOLD.totalCredit) +
    (buckets.OTHER_EXPENSE.totalDebit - buckets.OTHER_EXPENSE.totalCredit);

  const totalExpensesFromTable = Object.values(expenseByCategory).reduce(
    (s, n) => s + n,
    0
  );
  const totalExpenses = totalExpensesFromTable + ledgerExpense;
  const totalRevenue = revenue + accruedRevenue + ledgerIncome;
  const netAccrual = totalRevenue - totalExpenses;

  const rows: CsvRow[] = [
    { section: "Revenue", line: "Invoiced and paid", amount: revenue },
    {
      section: "Revenue",
      line: "Invoiced but unpaid (accrual)",
      amount: accruedRevenue,
    },
    {
      section: "Revenue",
      line: "Bank-categorised income (BNK-D + JE credits)",
      amount: ledgerIncome,
    },
    { section: "Revenue", line: "Total revenue", amount: totalRevenue },
    ...Object.entries(expenseByCategory).map(([cat, amt]) => ({
      section: "Expenses",
      line: cat,
      amount: amt,
    })),
    ...(ledgerExpense !== 0
      ? [
          {
            section: "Expenses",
            line: "Journal-entry expenses",
            amount: ledgerExpense,
          },
        ]
      : []),
    { section: "Expenses", line: "Total expenses", amount: totalExpenses },
    { section: "Summary", line: "Net (accrual basis)", amount: netAccrual },
  ];

  const csv = toCsv(rows, ["section", "line", "amount"]);
  const filename = `profit-loss-${csvDateSuffix(from)}-${csvDateSuffix(to)}`;
  return csvResponse(filename, csv);
}
