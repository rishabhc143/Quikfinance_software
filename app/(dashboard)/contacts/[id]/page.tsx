import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Edit2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteButton } from "@/components/shared/delete-button";
import { softDeleteContactAction } from "../actions";

export default async function ContactDetailPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const c = await db.contact.findFirst({
    where: { id: params.id, organizationId: organization.id, deletedAt: null },
    include: {
      _count: { select: { invoices: true, bills: true, quotes: true, salesOrders: true } },
    },
  });
  if (!c) notFound();

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button asChild variant="ghost" size="icon"><Link href="/contacts"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <h1 className="text-xl font-semibold truncate">{c.displayName}</h1>
          <Badge>{c.type === "BOTH" ? "Customer + Vendor" : c.type.charAt(0) + c.type.slice(1).toLowerCase()}</Badge>
        </div>
        <div className="flex gap-2">
          <DeleteButton action={softDeleteContactAction.bind(null, c.id)} confirmText="Delete this contact?" redirectTo="/contacts" />
          <Button asChild><Link href={`/contacts/${c.id}/edit`}><Edit2 className="h-3.5 w-3.5 mr-1" /> Edit</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Company">{c.companyName ?? "—"}</Row>
              <Row label="Email">{c.email ?? "—"}</Row>
              <Row label="Phone">{c.phone ?? "—"}</Row>
              <Row label="Tax ID">{c.taxId ?? "—"}</Row>
              <Row label="Currency">{c.currency ?? "—"}</Row>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Row label="Invoices">{c._count.invoices}</Row>
              <Row label="Bills">{c._count.bills}</Row>
              <Row label="Quotes">{c._count.quotes}</Row>
              <Row label="Sales Orders">{c._count.salesOrders}</Row>
            </dl>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">Addresses & notes</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-3 md:grid-cols-2 text-sm">
              <Row label="Billing">{c.billingAddress ?? "—"}</Row>
              <Row label="Shipping">{c.shippingAddress ?? "—"}</Row>
              <Row label="Notes" className="md:col-span-2">{c.notes ?? "—"}</Row>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-line">{children}</dd>
    </div>
  );
}
