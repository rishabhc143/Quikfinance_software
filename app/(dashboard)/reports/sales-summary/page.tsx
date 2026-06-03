import { BackLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft, Download } from "lucide-react";
import { startOfYear, format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Sales Summary" };

export default async function SalesSummaryPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const cur = organization.currency;
  const from = searchParams.from ? new Date(searchParams.from) : startOfYear(new Date());
  const to = searchParams.to ? new Date(searchParams.to) : new Date();

  const invoices = await db.invoice.findMany({
    where: { organizationId: organization.id, deletedAt: null, issueDate: { gte: from, lte: to } },
    include: { contact: { select: { displayName: true } }, lineItems: { include: { item: { select: { name: true } } } } },
  });

  const byCustomer = new Map<string, { name: string; total: number; count: number }>();
  const byItem = new Map<string, { name: string; revenue: number; quantity: number }>();
  let grossSales = 0;
  let openSales = 0;
  let paidSales = 0;

  for (const inv of invoices) {
    const t = Number(inv.total);
    grossSales += t;
    if (inv.status === "PAID") paidSales += t;
    else if (inv.status !== "VOID") openSales += t;

    const c = byCustomer.get(inv.contactId);
    if (c) { c.total += t; c.count++; }
    else byCustomer.set(inv.contactId, { name: inv.contact.displayName, total: t, count: 1 });

    for (const line of inv.lineItems) {
      const key = line.itemId ?? `__${line.description}`;
      const name = line.item?.name ?? line.description;
      const r = byItem.get(key);
      const lineTotal = Number(line.amount);
      const qty = Number(line.quantity);
      if (r) { r.revenue += lineTotal; r.quantity += qty; }
      else byItem.set(key, { name, revenue: lineTotal, quantity: qty });
    }
  }

  const customerRows = Array.from(byCustomer.values()).sort((a, b) => b.total - a.total).slice(0, 20);
  const itemRows = Array.from(byItem.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 20);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><BackLink href="/reports"><ArrowLeft className="h-4 w-4" /></BackLink></Button>
        <h1 className="text-xl font-semibold">Sales Summary</h1>
        <div className="ml-auto">
          <Button asChild variant="outline" size="sm" className="gap-1">
            <a href={`/reports/sales-summary/export?from=${format(from, "yyyy-MM-dd")}&to=${format(to, "yyyy-MM-dd")}`}>
              <Download className="h-4 w-4" /> Download CSV
            </a>
          </Button>
        </div>
      </div>
      <form className="flex items-center gap-2 text-sm" action="/reports/sales-summary">
        <label>From <input type="date" name="from" defaultValue={format(from, "yyyy-MM-dd")} className="ml-1 h-9 rounded-md border border-input bg-background px-3 text-sm" /></label>
        <label>To <input type="date" name="to" defaultValue={format(to, "yyyy-MM-dd")} className="ml-1 h-9 rounded-md border border-input bg-background px-3 text-sm" /></label>
        <Button type="submit" size="sm" variant="outline">Apply</Button>
      </form>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Gross sales</div><div className="text-2xl font-semibold mt-1 tabular-nums">{formatMoney(grossSales, cur)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Paid sales</div><div className="text-2xl font-semibold mt-1 tabular-nums text-emerald-600">{formatMoney(paidSales, cur)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Open sales</div><div className="text-2xl font-semibold mt-1 tabular-nums">{formatMoney(openSales, cur)}</div></CardContent></Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Top customers</CardTitle></CardHeader>
          <CardContent className="p-0">
            {customerRows.length === 0 ? <div className="p-6 text-sm text-center text-muted-foreground">No invoices in this period.</div> : (
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">Customer</th><th className="text-right p-3">Invoices</th><th className="text-right p-3">Revenue</th></tr></thead>
                <tbody className="divide-y">
                  {customerRows.map((c) => (
                    <tr key={c.name}><td className="p-3 font-medium">{c.name}</td><td className="p-3 text-right tabular-nums">{c.count}</td><td className="p-3 text-right tabular-nums">{formatMoney(c.total, cur)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top items</CardTitle></CardHeader>
          <CardContent className="p-0">
            {itemRows.length === 0 ? <div className="p-6 text-sm text-center text-muted-foreground">No items billed.</div> : (
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">Item</th><th className="text-right p-3">Quantity</th><th className="text-right p-3">Revenue</th></tr></thead>
                <tbody className="divide-y">
                  {itemRows.map((r) => (
                    <tr key={r.name}><td className="p-3">{r.name}</td><td className="p-3 text-right tabular-nums">{r.quantity}</td><td className="p-3 text-right tabular-nums">{formatMoney(r.revenue, cur)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
