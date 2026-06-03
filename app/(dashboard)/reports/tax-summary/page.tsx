import Link from "next/link";
import { BackLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft } from "lucide-react";
import { startOfYear, format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Tax Summary" };

export default async function TaxSummaryPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization } = await requireOrganization();
  const cur = organization.currency;
  const from = searchParams.from ? new Date(searchParams.from) : startOfYear(new Date());
  const to = searchParams.to ? new Date(searchParams.to) : new Date();

  const [collectedAgg, paidAgg] = await Promise.all([
    db.invoice.aggregate({ where: { organizationId: organization.id, deletedAt: null, issueDate: { gte: from, lte: to } }, _sum: { taxTotal: true } }),
    db.bill.aggregate({ where: { organizationId: organization.id, deletedAt: null, issueDate: { gte: from, lte: to } }, _sum: { taxTotal: true } }),
  ]);
  const taxes = await db.tax.findMany({ where: { organizationId: organization.id, isActive: true }, orderBy: { name: "asc" } });

  const collected = Number(collectedAgg._sum.taxTotal ?? 0);
  const paid = Number(paidAgg._sum.taxTotal ?? 0);
  const net = collected - paid;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><BackLink href="/reports"><ArrowLeft className="h-4 w-4" /></BackLink></Button>
        <h1 className="text-xl font-semibold">Tax Summary</h1>
      </div>

      <form className="flex items-center gap-2 text-sm" action="/reports/tax-summary">
        <label>From <input type="date" name="from" defaultValue={format(from, "yyyy-MM-dd")} className="ml-1 h-9 rounded-md border border-input bg-background px-3 text-sm" /></label>
        <label>To <input type="date" name="to" defaultValue={format(to, "yyyy-MM-dd")} className="ml-1 h-9 rounded-md border border-input bg-background px-3 text-sm" /></label>
        <Button type="submit" size="sm" variant="outline">Apply</Button>
      </form>

      <Alert variant="info">
        <Info className="h-4 w-4" />
        <AlertDescription>
          The current schema stores tax totals at the invoice/bill level. Per-tax-code breakdown will appear once line-item tax codes are wired in
          (Sales Orders / Credit Notes update). The active tax codes you have configured are listed below for reference.
        </AlertDescription>
      </Alert>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Tax collected (sales)</div><div className="text-2xl font-semibold mt-1 tabular-nums text-emerald-600">{formatMoney(collected, cur)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Tax paid (purchases)</div><div className="text-2xl font-semibold mt-1 tabular-nums text-destructive">{formatMoney(paid, cur)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Net tax owed</div><div className={"text-2xl font-semibold mt-1 tabular-nums " + (net >= 0 ? "" : "text-emerald-600")}>{formatMoney(net, cur)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Active tax codes</CardTitle></CardHeader>
        <CardContent className="p-0">
          {taxes.length === 0 ? (
            <div className="p-6 text-sm text-center text-muted-foreground">No tax codes yet. <Link href="/settings/taxes" className="underline">Add one</Link>.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">Name</th><th className="text-left p-3">Type</th><th className="text-right p-3">Rate</th></tr></thead>
              <tbody className="divide-y">
                {taxes.map((t) => (
                  <tr key={t.id}>
                    <td className="p-3 font-medium">{t.name}</td>
                    <td className="p-3 capitalize">{t.type.replace("_", " ")}</td>
                    <td className="p-3 text-right tabular-nums">{Number(t.rate).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
