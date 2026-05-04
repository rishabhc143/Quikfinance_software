import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import Link from "next/link";
import { SettingsShell } from "@/components/shared/settings-shell";

export const metadata = { title: "Data Management" };

export default async function DataPage() {
  const { organization } = await requireOrganization();
  const orgId = organization.id;
  const [items, contacts, invoices, bills, payments, expenses] = await Promise.all([
    db.item.count({ where: { organizationId: orgId } }),
    db.contact.count({ where: { organizationId: orgId } }),
    db.invoice.count({ where: { organizationId: orgId } }),
    db.bill.count({ where: { organizationId: orgId } }),
    db.paymentReceived.count({ where: { organizationId: orgId } }),
    db.expense.count({ where: { organizationId: orgId } }),
  ]);
  return (
    <SettingsShell title="Data Management" description="Bulk export, import, and storage usage for this organization.">
      <Alert variant="info"><Info className="h-4 w-4" /><AlertDescription>Per-module export already lives on each list page (Items has CSV/XLSX). Org-wide JSON dump and time-bounded archive shipping with a future release.</AlertDescription></Alert>
      <Card>
        <CardHeader><CardTitle className="text-base">Record counts</CardTitle></CardHeader>
        <CardContent className="grid gap-3 grid-cols-2 md:grid-cols-3 text-sm">
          <Stat label="Items" n={items} /><Stat label="Contacts" n={contacts} /><Stat label="Invoices" n={invoices} /><Stat label="Bills" n={bills} /><Stat label="Payments received" n={payments} /><Stat label="Expenses" n={expenses} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Quick exports</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm"><Link href="/api/items/export?scope=all">Items CSV</Link></Button>
          <Button asChild variant="outline" size="sm"><Link href="/api/items/export?scope=all&format=xlsx">Items XLSX</Link></Button>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}

function Stat({ label, n }: { label: string; n: number }) {
  return <div><div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div><div className="text-xl font-semibold tabular-nums">{n.toLocaleString()}</div></div>;
}
