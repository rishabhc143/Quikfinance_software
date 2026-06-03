import { BackLink } from "@/components/shared/dirty-form-nav";
import { ArrowLeft, Download } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";

export const metadata = { title: "Payables Aging" };

const BUCKETS = [
  { label: "Current", min: -Infinity, max: 0 },
  { label: "1–30 days", min: 1, max: 30 },
  { label: "31–60 days", min: 31, max: 60 },
  { label: "61–90 days", min: 61, max: 90 },
  { label: "Over 90 days", min: 91, max: Infinity },
];

export default async function ApAgingPage() {
  const { organization } = await requireOrganization();
  const cur = organization.currency;
  const now = new Date();

  const bills = await db.bill.findMany({
    where: { organizationId: organization.id, deletedAt: null, status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] } },
    include: { contact: { select: { displayName: true } } },
  });

  const byVendor = new Map<string, { name: string; buckets: number[]; total: number }>();
  for (const b of bills) {
    const overdueDays = Math.floor((now.getTime() - b.dueDate.getTime()) / 86_400_000);
    const outstanding = Number(b.total) - Number(b.amountPaid);
    if (outstanding <= 0) continue;
    const idx = BUCKETS.findIndex((bk) => overdueDays >= bk.min && overdueDays <= bk.max);
    if (idx < 0) continue;
    const key = b.contactId;
    if (!byVendor.has(key)) byVendor.set(key, { name: b.contact.displayName, buckets: BUCKETS.map(() => 0), total: 0 });
    const row = byVendor.get(key)!;
    row.buckets[idx] += outstanding;
    row.total += outstanding;
  }

  const rows = Array.from(byVendor.values()).sort((a, b) => b.total - a.total);
  const totals = BUCKETS.map((_, i) => rows.reduce((s, r) => s + r.buckets[i], 0));
  const grand = totals.reduce((s, n) => s + n, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><BackLink href="/reports"><ArrowLeft className="h-4 w-4" /></BackLink></Button>
        <h1 className="text-xl font-semibold">Payables Aging</h1>
        <div className="ml-auto">
          <Button asChild variant="outline" size="sm" className="gap-1">
            <a href="/reports/ap-aging/export"><Download className="h-4 w-4" /> Download CSV</a>
          </Button>
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Outstanding by vendor</CardTitle></CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-6 text-sm text-center text-muted-foreground">No outstanding bills.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Vendor</th>
                  {BUCKETS.map((b) => <th key={b.label} className="text-right p-3">{b.label}</th>)}
                  <th className="text-right p-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td className="p-3 font-medium">{r.name}</td>
                    {r.buckets.map((b, i) => <td key={i} className="p-3 text-right tabular-nums">{b > 0 ? formatMoney(b, cur) : "—"}</td>)}
                    <td className="p-3 text-right tabular-nums font-semibold">{formatMoney(r.total, cur)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30 text-sm">
                <tr>
                  <td className="p-3 font-medium">Total</td>
                  {totals.map((t, i) => <td key={i} className="p-3 text-right tabular-nums font-semibold">{t > 0 ? formatMoney(t, cur) : "—"}</td>)}
                  <td className="p-3 text-right tabular-nums font-semibold">{formatMoney(grand, cur)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
