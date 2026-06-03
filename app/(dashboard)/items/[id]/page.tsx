import Link from "next/link";
import { BackLink } from "@/components/shared/dirty-form-nav";
import { notFound } from "next/navigation";
import { ArrowLeft, Edit2 } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { DeleteRestoreButtons } from "./delete-restore";

export default async function ItemDetailPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const item = await db.item.findFirst({
    where: { id: params.id, organizationId: organization.id },
  });
  if (!item) notFound();

  const [salesAccount, purchaseAccount] = await Promise.all([
    item.salesAccountId
      ? db.chartOfAccount.findFirst({ where: { id: item.salesAccountId, organizationId: organization.id }, select: { name: true } })
      : null,
    item.purchaseAccountId
      ? db.chartOfAccount.findFirst({ where: { id: item.purchaseAccountId, organizationId: organization.id }, select: { name: true } })
      : null,
  ]);

  const cur = organization.currency;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          <Button asChild variant="ghost" size="icon"><BackLink href="/items"><ArrowLeft className="h-4 w-4" /></BackLink></Button>
          <h1 className="text-xl font-semibold truncate">{item.name}</h1>
          <Badge variant={item.isActive ? "success" : "secondary"}>{item.isActive ? "Active" : "Inactive"}</Badge>
          {item.deletedAt && <Badge variant="destructive">Deleted</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <DeleteRestoreButtons id={item.id} isDeleted={!!item.deletedAt} />
          {!item.deletedAt && (
            <Button asChild>
              <Link href={`/items/${item.id}/edit`}><Edit2 className="h-3.5 w-3.5 mr-1" /> Edit</Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Overview</CardTitle></CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-2">
            <Field label="Type">{item.type === "GOODS" ? "Goods" : "Service"}</Field>
            <Field label="Unit">{item.unit ?? "—"}</Field>
            <Field label="SKU">{item.sku ?? "—"}</Field>
            <Field label="Track Inventory">{item.trackInventory ? "Yes" : "No"}</Field>
          </dl>
        </CardContent>
      </Card>

      {item.images && item.images.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Images ({item.images.length})</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {item.images.map((src, i) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img key={i} src={src} alt={`${item.name} image ${i + 1}`} className="aspect-square w-full object-cover rounded-md border" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Sales Information</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Field label="Selling Price">{item.sellingPrice !== null ? formatMoney(item.sellingPrice, cur) : "—"}</Field>
              <Field label="Account">{salesAccount?.name ?? "—"}</Field>
              <Field label="Description">{item.salesDescription ?? "—"}</Field>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Purchase Information</CardTitle></CardHeader>
          <CardContent>
            <dl className="space-y-2 text-sm">
              <Field label="Cost Price">{item.costPrice !== null ? formatMoney(item.costPrice, cur) : "—"}</Field>
              <Field label="Account">{purchaseAccount?.name ?? "—"}</Field>
              <Field label="Description">{item.purchaseDescription ?? "—"}</Field>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
