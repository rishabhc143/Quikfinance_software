import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { startOfYear, endOfYear, format } from "date-fns";
import {
  aggregateLedgerLines,
  sumByBucket,
  type AccountBucket,
} from "@/lib/reports/ledger-aggregation";

export const metadata = { title: "Profit & Loss" };

export default async function ProfitLossPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const cur = organization.currency;
  const now = new Date();
  const from = searchParams.from ? new Date(searchParams.from) : startOfYear(now);
  const to = searchParams.to ? new Date(searchParams.to) : endOfYear(now);

  const [paidInvoices, expenses, openInvoices, jeLines] = await Promise.all([
    db.invoice.aggregate({
      where: {
        organizationId: organization.id, deletedAt: null, status: "PAID",
        issueDate: { gte: from, lte: to },
      },
      _sum: { total: true }, _count: true,
    }),
    db.expense.findMany({
      where: { organizationId: organization.id, date: { gte: from, lte: to }, deletedAt: null },
      select: { category: true, amount: true },
    }),
    db.invoice.aggregate({
      where: {
        organizationId: organization.id, deletedAt: null,
        status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
        issueDate: { gte: from, lte: to },
      },
      _sum: { total: true, amountPaid: true },
    }),
    // RPT-A — JournalEntryLine rows in the period whose account is an
    // income or expense bucket. Captures BNK-D Money In Categorise +
    // BNK-E rule fires + any Manual Journals.
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

  const expenseByCategory = expenses.reduce<Record<string, number>>((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + Number(e.amount);
    return acc;
  }, {});
  const totalExpensesFromTable = Object.values(expenseByCategory).reduce(
    (s, n) => s + n,
    0
  );

  // RPT-A — aggregate the JE lines into bucket totals. Income buckets
  // contribute their CR side to revenue; expense buckets contribute
  // their DR side (less any reversing CRs).
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

  const totalExpenses = totalExpensesFromTable + ledgerExpense;
  const netCash = revenue + ledgerIncome - totalExpenses;
  const netAccrual = revenue + accruedRevenue + ledgerIncome - totalExpenses;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/reports"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h1 className="text-xl font-semibold">Profit &amp; Loss</h1>
          <p className="text-sm text-muted-foreground">{format(from, "dd MMM yyyy")} → {format(to, "dd MMM yyyy")}</p>
        </div>
        <div className="ml-auto">
          <Button asChild variant="outline" size="sm" className="gap-1">
            <a
              href={`/reports/profit-loss/export?from=${format(from, "yyyy-MM-dd")}&to=${format(to, "yyyy-MM-dd")}`}
            >
              <Download className="h-4 w-4" /> Download CSV
            </a>
          </Button>
        </div>
      </div>

      <form className="flex items-center gap-2 text-sm" action="/reports/profit-loss">
        <label>From <input type="date" name="from" defaultValue={format(from, "yyyy-MM-dd")} className="ml-1 h-9 rounded-md border border-input bg-background px-3 text-sm" /></label>
        <label>To <input type="date" name="to" defaultValue={format(to, "yyyy-MM-dd")} className="ml-1 h-9 rounded-md border border-input bg-background px-3 text-sm" /></label>
        <Button type="submit" size="sm" variant="outline">Apply</Button>
      </form>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Revenue (paid)</div><div className="text-2xl font-semibold mt-1 tabular-nums">{formatMoney(revenue, cur)}</div><div className="text-xs text-muted-foreground mt-1">{paidInvoices._count} invoices</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Total expenses</div><div className="text-2xl font-semibold mt-1 tabular-nums">{formatMoney(totalExpenses, cur)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Net (cash basis)</div><div className={"text-2xl font-semibold mt-1 tabular-nums " + (netCash >= 0 ? "text-emerald-600" : "text-destructive")}>{formatMoney(netCash, cur)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Revenue</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <tbody className="divide-y">
              <tr><td className="p-3">Invoiced and paid</td><td className="p-3 text-right tabular-nums">{formatMoney(revenue, cur)}</td></tr>
              <tr><td className="p-3 text-muted-foreground">Invoiced but unpaid (accrual)</td><td className="p-3 text-right tabular-nums text-muted-foreground">{formatMoney(accruedRevenue, cur)}</td></tr>
              <tr>
                <td className="p-3">
                  Bank-categorised income
                  <span className="text-[11px] text-muted-foreground ml-1">
                    (BNK-D + Manual Journal credits to INCOME/Other Income)
                  </span>
                </td>
                <td className="p-3 text-right tabular-nums">
                  {formatMoney(ledgerIncome, cur)}
                </td>
              </tr>
            </tbody>
            <tfoot className="bg-muted/30">
              <tr><td className="p-3 font-medium">Total revenue (accrual basis)</td><td className="p-3 text-right tabular-nums font-semibold">{formatMoney(revenue + accruedRevenue + ledgerIncome, cur)}</td></tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Expenses by category</CardTitle></CardHeader>
        <CardContent className="p-0">
          {Object.keys(expenseByCategory).length === 0 && ledgerExpense === 0 ? (
            <div className="p-6 text-sm text-center text-muted-foreground">No expenses recorded in this period.</div>
          ) : (
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => (
                  <tr key={cat}><td className="p-3">{cat}</td><td className="p-3 text-right tabular-nums">{formatMoney(amt, cur)}</td></tr>
                ))}
                {ledgerExpense !== 0 ? (
                  <tr>
                    <td className="p-3">
                      Journal-entry expenses
                      <span className="text-[11px] text-muted-foreground ml-1">
                        (Manual Journal debits to Expense / COGS / Other Expense)
                      </span>
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {formatMoney(ledgerExpense, cur)}
                    </td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot className="bg-muted/30">
                <tr><td className="p-3 font-medium">Total expenses</td><td className="p-3 text-right tabular-nums font-semibold">{formatMoney(totalExpenses, cur)}</td></tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <span className="font-medium">Net profit (accrual basis)</span>
            <span className={"text-xl font-semibold tabular-nums " + (netAccrual >= 0 ? "text-emerald-600" : "text-destructive")}>{formatMoney(netAccrual, cur)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
