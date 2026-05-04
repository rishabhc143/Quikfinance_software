import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { ItemForm, type ItemFormValues } from "../../item-form";
import { updateItemAction } from "../../actions";

export default async function EditItemPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const item = await db.item.findFirst({ where: { id: params.id, organizationId: organization.id } });
  if (!item) notFound();

  const initial: ItemFormValues = {
    name: item.name,
    type: item.type,
    unit: item.unit,
    imageUrl: item.imageUrl,
    images: item.images ?? [],
    sellingPrice: item.sellingPrice ? Number(item.sellingPrice) : null,
    salesAccountId: item.salesAccountId,
    salesDescription: item.salesDescription,
    costPrice: item.costPrice ? Number(item.costPrice) : null,
    purchaseAccountId: item.purchaseAccountId,
    purchaseDescription: item.purchaseDescription,
    preferredVendorId: item.preferredVendorId,
    trackInventory: item.trackInventory,
    inventoryAccountId: item.inventoryAccountId,
    openingStock: item.openingStock ? Number(item.openingStock) : null,
    openingStockRate: item.openingStockRate ? Number(item.openingStockRate) : null,
    reorderPoint: item.reorderPoint ? Number(item.reorderPoint) : null,
  };

  async function update(formData: FormData) {
    "use server";
    await updateItemAction(params.id, formData);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href={`/items/${item.id}`}><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">Edit Item</h1>
      </div>
      <ItemForm initial={initial} onSubmit={update} submitLabel="Update" />
    </div>
  );
}
