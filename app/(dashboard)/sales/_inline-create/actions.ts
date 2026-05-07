"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

/**
 * Shared inline-create server actions for the New * forms (Quote / Sales
 * Order / Invoice / etc.). Per <quotes_spec> + <sales_orders_spec>: the
 * Salesperson and Delivery Method comboboxes both expose an inline
 * "Add …" entry that creates a new row without leaving the form.
 *
 * Each returns the new row's id + label so the caller can update its
 * combobox state.
 */

const nameSchema = z.object({ name: z.string().min(1).max(120) });

export async function createSalespersonInlineAction(
  input: z.input<typeof nameSchema>
): Promise<{ id: string; name: string }> {
  const { user, organization } = await requireOrganization();
  const data = nameSchema.parse(input);
  const created = await db.salesperson.create({
    data: { organizationId: organization.id, name: data.name },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Salesperson",
    entityId: created.id,
    after: { name: created.name },
  });
  revalidatePath("/sales/quotes/new");
  revalidatePath("/sales/orders/new");
  revalidatePath("/sales/invoices/new");
  return { id: created.id, name: created.name };
}

export async function createDeliveryMethodInlineAction(
  input: z.input<typeof nameSchema>
): Promise<{ id: string; name: string }> {
  const { user, organization } = await requireOrganization();
  const data = nameSchema.parse(input);
  const created = await db.deliveryMethod.create({
    data: { organizationId: organization.id, name: data.name },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "DeliveryMethod",
    entityId: created.id,
    after: { name: created.name },
  });
  revalidatePath("/sales/orders/new");
  return { id: created.id, name: created.name };
}

/**
 * Inline create for a minimal Customer (per <quotes_spec> "+ Add new
 * customer" inline). Only displayName + email are required; the merchant
 * can fill in the rest later via Edit Customer.
 */
const customerInlineSchema = z.object({
  displayName: z.string().min(1).max(200),
  email: z.string().email().max(200).optional().or(z.literal("")).nullable(),
});

export async function createCustomerInlineAction(
  input: z.input<typeof customerInlineSchema>
): Promise<{ id: string; displayName: string }> {
  const { user, organization } = await requireOrganization();
  const data = customerInlineSchema.parse(input);
  const dup = await db.contact.findFirst({
    where: {
      organizationId: organization.id,
      displayName: data.displayName,
      deletedAt: null,
    },
    select: { id: true, displayName: true },
  });
  if (dup) return dup;
  const created = await db.contact.create({
    data: {
      organizationId: organization.id,
      type: "CUSTOMER",
      customerType: "BUSINESS",
      displayName: data.displayName,
      email: data.email || null,
      currency: organization.currency,
    },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Contact",
    entityId: created.id,
    after: { displayName: created.displayName, type: created.type, inline: true },
  });
  revalidatePath("/sales/customers");
  return { id: created.id, displayName: created.displayName };
}

/**
 * M17e: Look up an Item by its SKU within the current org. Used by the
 * Scan Item modal to resolve a barcode → Item row. Returns null when
 * not found so the caller can show a friendly toast.
 */
export async function findItemBySkuAction(input: {
  sku: string;
}): Promise<{
  id: string;
  name: string;
  sku: string | null;
  rate: string;
  description: string | null;
  unit: string | null;
} | null> {
  const { organization } = await requireOrganization();
  const sku = input.sku.trim();
  if (!sku) return null;
  const item = await db.item.findFirst({
    where: {
      organizationId: organization.id,
      deletedAt: null,
      isActive: true,
      sku: { equals: sku, mode: "insensitive" },
    },
    select: {
      id: true,
      name: true,
      sku: true,
      sellingPrice: true,
      salesDescription: true,
      unit: true,
    },
  });
  if (!item) return null;
  return {
    id: item.id,
    name: item.name,
    sku: item.sku,
    rate: item.sellingPrice ? String(item.sellingPrice) : "0",
    description: item.salesDescription,
    unit: item.unit,
  };
}
