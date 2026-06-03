"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { itemFormSchema } from "@/lib/validations/item";

export async function createItemAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = parseForm(formData);

  const created = await db.item.create({
    data: {
      organizationId: organization.id,
      name: data.name,
      type: data.type,
      unit: data.unit ?? null,
      imageUrl: data.imageUrl ?? null,
      images: data.images ?? [],
      sellingPrice: data.sellingPrice ?? null,
      salesAccountId: data.salesAccountId ?? null,
      salesDescription: data.salesDescription ?? null,
      salesTaxId: data.salesTaxId ?? null,
      sellingPriceInclusiveOfTax: data.sellingPriceInclusiveOfTax,
      costPrice: data.costPrice ?? null,
      purchaseAccountId: data.purchaseAccountId ?? null,
      purchaseDescription: data.purchaseDescription ?? null,
      preferredVendorId: data.preferredVendorId ?? null,
      trackInventory: data.trackInventory,
      inventoryAccountId: data.inventoryAccountId ?? null,
      openingStock: data.openingStock ?? null,
      openingStockRate: data.openingStockRate ?? null,
      reorderPoint: data.reorderPoint ?? null,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Item",
    entityId: created.id,
    after: { name: created.name, type: created.type },
  });

  revalidatePath("/items");
  redirect("/items");
}

export async function updateItemAction(id: string, formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = parseForm(formData);

  const before = await db.item.findFirst({ where: { id, organizationId: organization.id } });
  if (!before) throw new Error("Not found");

  const updated = await db.item.update({
    where: { id },
    data: {
      name: data.name,
      type: data.type,
      unit: data.unit ?? null,
      imageUrl: data.imageUrl ?? null,
      images: data.images ?? [],
      sellingPrice: data.sellingPrice ?? null,
      salesAccountId: data.salesAccountId ?? null,
      salesDescription: data.salesDescription ?? null,
      salesTaxId: data.salesTaxId ?? null,
      sellingPriceInclusiveOfTax: data.sellingPriceInclusiveOfTax,
      costPrice: data.costPrice ?? null,
      purchaseAccountId: data.purchaseAccountId ?? null,
      purchaseDescription: data.purchaseDescription ?? null,
      preferredVendorId: data.preferredVendorId ?? null,
      trackInventory: data.trackInventory,
      inventoryAccountId: data.inventoryAccountId ?? null,
      openingStock: data.openingStock ?? null,
      openingStockRate: data.openingStockRate ?? null,
      reorderPoint: data.reorderPoint ?? null,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Item",
    entityId: id,
    before: { name: before.name, sellingPrice: before.sellingPrice?.toString() },
    after: { name: updated.name, sellingPrice: updated.sellingPrice?.toString() },
  });

  revalidatePath("/items");
  redirect("/items");
}

export async function softDeleteItemsAction(ids: string[]) {
  const { user, organization } = await requireOrganization();
  if (!ids.length) return { ok: true, count: 0 };

  await db.item.updateMany({
    where: { id: { in: ids }, organizationId: organization.id },
    data: { deletedAt: new Date(), isActive: false },
  });
  for (const id of ids) {
    await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Item", entityId: id });
  }
  revalidatePath("/items");
  return { ok: true, count: ids.length };
}

export async function restoreItemAction(id: string) {
  const { user, organization } = await requireOrganization();
  const item = await db.item.findFirst({ where: { id, organizationId: organization.id } });
  if (!item) return { ok: false };
  await db.item.update({ where: { id }, data: { deletedAt: null, isActive: true } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "RESTORE", entityType: "Item", entityId: id });
  revalidatePath("/items");
  revalidatePath(`/items/${id}`);
  return { ok: true };
}

export async function setItemsActiveAction(ids: string[], isActive: boolean) {
  const { user, organization } = await requireOrganization();
  if (!ids.length) return { ok: true, count: 0 };

  await db.item.updateMany({
    where: { id: { in: ids }, organizationId: organization.id, deletedAt: null },
    data: { isActive },
  });
  for (const id of ids) {
    await writeAuditLog({
      organizationId: organization.id,
      userId: user.id,
      action: "UPDATE",
      entityType: "Item",
      entityId: id,
      after: { isActive },
    });
  }
  revalidatePath("/items");
  return { ok: true, count: ids.length };
}

const importSchema = z.object({
  rows: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(["GOODS", "SERVICE"]).default("GOODS"),
    unit: z.string().optional().nullable(),
    sellingPrice: z.coerce.number().optional().nullable(),
    costPrice: z.coerce.number().optional().nullable(),
    salesDescription: z.string().optional().nullable(),
    purchaseDescription: z.string().optional().nullable(),
  })),
  duplicateHandling: z.enum(["skip", "overwrite"]).default("skip"),
});

export async function importItemsAction(input: z.input<typeof importSchema>) {
  const { user, organization } = await requireOrganization();
  const parsed = importSchema.parse(input);

  let created = 0, updated = 0, skipped = 0;
  await db.$transaction(async (tx) => {
    for (const row of parsed.rows) {
      const existing = await tx.item.findFirst({
        where: { organizationId: organization.id, name: row.name, deletedAt: null },
      });
      if (existing) {
        if (parsed.duplicateHandling === "skip") { skipped++; continue; }
        await tx.item.update({
          where: { id: existing.id },
          data: {
            type: row.type,
            unit: row.unit ?? existing.unit,
            sellingPrice: row.sellingPrice ?? existing.sellingPrice,
            costPrice: row.costPrice ?? existing.costPrice,
            salesDescription: row.salesDescription ?? existing.salesDescription,
            purchaseDescription: row.purchaseDescription ?? existing.purchaseDescription,
          },
        });
        updated++;
      } else {
        const made = await tx.item.create({
          data: {
            organizationId: organization.id,
            name: row.name,
            type: row.type,
            unit: row.unit ?? null,
            sellingPrice: row.sellingPrice ?? null,
            costPrice: row.costPrice ?? null,
            salesDescription: row.salesDescription ?? null,
            purchaseDescription: row.purchaseDescription ?? null,
          },
        });
        await tx.auditLog.create({
          data: { organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Item", entityId: made.id, after: { name: made.name } },
        });
        created++;
      }
    }
  });

  revalidatePath("/items");
  return { created, updated, skipped };
}

function parseForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  let images: string[] = [];
  if (typeof raw.images === "string" && raw.images.length > 0) {
    try { const parsed = JSON.parse(raw.images); if (Array.isArray(parsed)) images = parsed.filter((x): x is string => typeof x === "string").slice(0, 5); }
    catch { /* malformed array, ignore */ }
  }
  const primary = images[0] ?? (typeof raw.imageUrl === "string" ? raw.imageUrl : null);
  const data = itemFormSchema.parse({
    ...raw,
    images,
    imageUrl: primary,
    trackInventory: raw.trackInventory === "on" || raw.trackInventory === "true",
    // Sales Information (PR #338): coerce the same way as trackInventory
    // since the form ships the toggle as a checkbox.
    sellingPriceInclusiveOfTax:
      raw.sellingPriceInclusiveOfTax === "on" ||
      raw.sellingPriceInclusiveOfTax === "true",
    sellingPrice: raw.sellingPrice === "" ? null : raw.sellingPrice,
    costPrice: raw.costPrice === "" ? null : raw.costPrice,
    openingStock: raw.openingStock === "" ? null : raw.openingStock,
    openingStockRate: raw.openingStockRate === "" ? null : raw.openingStockRate,
    reorderPoint: raw.reorderPoint === "" ? null : raw.reorderPoint,
  });
  return data;
}
