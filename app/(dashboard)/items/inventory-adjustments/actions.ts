"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  itemId: z.string().min(1),
  date: z.coerce.date(),
  direction: z.enum(["increase", "decrease"]),
  quantity: z.coerce.number().positive(),
  reason: z.string().min(1).max(120),
  notes: z.string().max(2000).optional().nullable(),
});

export async function createInventoryAdjustmentAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({
    itemId: formData.get("itemId"),
    date: formData.get("date"),
    direction: formData.get("direction"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason"),
    notes: formData.get("notes") || null,
  });

  // Verify item belongs to org
  const item = await db.item.findFirst({ where: { id: data.itemId, organizationId: organization.id, deletedAt: null } });
  if (!item) throw new Error("Item not found");

  const signedQty = data.direction === "increase" ? data.quantity : -data.quantity;

  const created = await db.inventoryAdjustment.create({
    data: {
      organizationId: organization.id,
      itemId: data.itemId, date: data.date,
      quantity: signedQty, reason: data.reason, notes: data.notes ?? null,
    },
  });
  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "CREATE", entityType: "InventoryAdjustment", entityId: created.id,
    after: { itemId: data.itemId, quantity: signedQty, reason: data.reason },
  });
  revalidatePath("/items/inventory-adjustments");
  redirect("/items/inventory-adjustments");
}

export async function deleteInventoryAdjustmentAction(id: string) {
  const { user, organization } = await requireOrganization();
  const adj = await db.inventoryAdjustment.findFirst({ where: { id, organizationId: organization.id } });
  if (!adj) return { ok: false };
  await db.inventoryAdjustment.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "InventoryAdjustment", entityId: id });
  revalidatePath("/items/inventory-adjustments");
  return { ok: true };
}
