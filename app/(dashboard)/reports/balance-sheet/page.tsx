import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Balance Sheet" };

export default async function BalanceSheetPage() {
  const { organization } = await requireOrganization();
  const cur = organization.currency;
  const orgId = organization.id;

  // Compute balances from transactions instead of journal entries (we don't ledger every txn yet).
  // Simple cash-basis estimate suitable for SMBs at this stage:
  const [bankAccounts, openInvoices, openBills, totalReceivedAgg, totalPaidAgg] = await Promise.all([
    db.bankAccount.findMany({ where: { organizationId: orgId, isActive: true } }),
    db.invoice.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } },
      select: { total: true, amountPaid: true },
    }),
    db.bill.findMany({
      where: { organizationId: orgId, deletedAt: null, status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] } },
      select: { total: true, amountPaid: true },
    }),
    db.paymentReceived.aggregate({ where: { organizationId: orgId }, _sum: { amount: true } }),
    db.paymentMade.aggregate({ where: { organizationId: orgId }, _sum: { amount: true } }),
  ]);

  const cashOnHand = bankAccounts.reduce((s, a) => s + Number(a.openingBalance), 0)
                   + Number(totalReceivedAgg._sum.amount ?? 0)
                   - Number(totalPaidAgg._sum.amount ?? 0);
  const accountsReceivable = openInvoices.reduce((s, i) => s + Number(i.total) - Number(i.amountPaid), 0);
  const accountsPayable = openBills.reduce((s, b) => s + Number(b.total) - Number(b.amountPaid), 0);
  const totalAssets = cashOnHand + accountsReceivable;
  const totalLiabilities = accountsPayable;
  const equity = totalAssets - totalLiabilities;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/reports"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">Balance Sheet</h1>
      </div>
      <p className="text-sm text-muted-foreground">As of {new Date().toLocaleDateString()} · cash-basis approximation across known accounts.</p>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Assets</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                <tr><td className="p-3">Cash &amp; bank balances</td><td className="p-3 text-right tabular-nums">{formatMoney(cashOnHand, cur)}</td></tr>
                <tr><td className="p-3">Accounts receivable</td><td className="p-3 text-right tabular-nums">{formatMoney(accountsReceivable, cur)}</td></tr>
              </tbody>
              <tfoot className="bg-muted/30">
                <tr><td className="p-3 font-medium">Total assets</td><td className="p-3 text-right tabular-nums font-semibold">{formatMoney(totalAssets, cur)}</td></tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Liabilities &amp; Equity</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody className="divide-y">
                <tr><td className="p-3">Accounts payable</td><td className="p-3 text-right tabular-nums">{formatMoney(accountsPayable, cur)}</td></tr>
                <tr><td className="p-3">Owner&apos;s equity (calculated)</td><td className="p-3 text-right tabular-nums">{formatMoney(equity, cur)}</td></tr>
              </tbody>
              <tfoot className="bg-muted/30">
                <tr><td className="p-3 font-medium">Total liabilities + equity</td><td className="p-3 text-right tabular-nums font-semibold">{formatMoney(accountsPayable + equity, cur)}</td></tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed">
        <CardContent className="pt-6 text-xs text-muted-foreground">
          <strong>Approximation notes.</strong> A formal balance sheet rolls up every journal entry. Quikfinance currently derives this from
          bank balances + payment events + open AR/AP. When the journal-entry module ships, this report will switch to a strict double-entry
          rollup.
        </CardContent>
      </Card>
    </div>
  );
}
