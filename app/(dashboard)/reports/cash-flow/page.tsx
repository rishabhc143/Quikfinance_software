import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { CashFlowChart } from "./chart";

export const metadata = { title: "Cash Flow" };

export default async function CashFlowPage() {
  const { organization } = await requireOrganization();
  const cur = organization.currency;

  const months: { from: Date; to: Date; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = subMonths(new Date(), i);
    months.push({ from: startOfMonth(d), to: endOfMonth(d), label: format(d, "MMM yyyy") });
  }

  const data = await Promise.all(months.map(async (m) => {
    const [received, made, expenses] = await Promise.all([
      db.paymentReceived.aggregate({ where: { organizationId: organization.id, paymentDate: { gte: m.from, lte: m.to } }, _sum: { amount: true } }),
      db.paymentMade.aggregate({ where: { organizationId: organization.id, paymentDate: { gte: m.from, lte: m.to } }, _sum: { amount: true } }),
      db.expense.aggregate({ where: { organizationId: organization.id, date: { gte: m.from, lte: m.to } }, _sum: { amount: true } }),
    ]);
    const inflow = Number(received._sum.amount ?? 0);
    const outflow = Number(made._sum.amount ?? 0) + Number(expenses._sum.amount ?? 0);
    return { month: m.label, inflow, outflow, net: inflow - outflow };
  }));

  const totals = data.reduce((acc, m) => ({
    inflow: acc.inflow + m.inflow,
    outflow: acc.outflow + m.outflow,
    net: acc.net + m.net,
  }), { inflow: 0, outflow: 0, net: 0 });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/reports"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">Cash Flow</h1>
      </div>
      <p className="text-sm text-muted-foreground">Last 6 months. Inflow = payments received. Outflow = payments made + recorded expenses.</p>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Total inflow (6m)</div><div className="text-2xl font-semibold mt-1 tabular-nums text-emerald-600">{formatMoney(totals.inflow, cur)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Total outflow (6m)</div><div className="text-2xl font-semibold mt-1 tabular-nums text-destructive">{formatMoney(totals.outflow, cur)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Net (6m)</div><div className={"text-2xl font-semibold mt-1 tabular-nums " + (totals.net >= 0 ? "text-emerald-600" : "text-destructive")}>{formatMoney(totals.net, cur)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Monthly cash flow</CardTitle></CardHeader>
        <CardContent>
          <CashFlowChart data={data} currency={cur} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Detail</CardTitle></CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Month</th><th className="text-right p-3">Inflow</th><th className="text-right p-3">Outflow</th><th className="text-right p-3">Net</th></tr>
            </thead>
            <tbody className="divide-y">
              {data.map((m) => (
                <tr key={m.month}>
                  <td className="p-3 font-medium">{m.month}</td>
                  <td className="p-3 text-right tabular-nums text-emerald-600">{m.inflow > 0 ? formatMoney(m.inflow, cur) : "—"}</td>
                  <td className="p-3 text-right tabular-nums text-destructive">{m.outflow > 0 ? `-${formatMoney(m.outflow, cur)}` : "—"}</td>
                  <td className={"p-3 text-right tabular-nums font-semibold " + (m.net >= 0 ? "text-emerald-600" : "text-destructive")}>{formatMoney(m.net, cur)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
