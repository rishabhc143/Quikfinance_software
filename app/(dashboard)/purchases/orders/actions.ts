"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";

const schema = z.object({
  contactId: z.string().min(1),
  date: z.coerce.date(),
  total: z.coerce.number().nonnegative(),
  status: z.string().min(1),
});
export type PurchaseOrderInput = z.input<typeof schema>;

export async function createPurchaseOrderAction(input: PurchaseOrderInput) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  const number = await nextDocumentNumber(organization.id, "purchaseOrder");
  const created = await db.purchaseOrder.create({
    data: { organizationId: organization.id, number, contactId: data.contactId, status: data.status, orderDate: data.date, total: data.total },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "PurchaseOrder", entityId: created.id, after: { number, total: data.total } });
  revalidatePath("/purchases/orders");
  redirect("/purchases/orders");
}

export async function deletePurchaseOrderAction(id: string) {
  const { user, organization } = await requireOrganization();
  const po = await db.purchaseOrder.findFirst({ where: { id, organizationId: organization.id } });
  if (!po) return { ok: false };
  // Block if linked to non-deleted bills — destroying the PO would
  // orphan their `purchaseOrderId` reference.
  const linkedBills = await db.bill.count({
    where: {
      purchaseOrderId: id,
      organizationId: organization.id,
      deletedAt: null,
    },
  });
  if (linkedBills > 0) {
    return {
      ok: false,
      error: `Cannot delete — ${linkedBills} bill${linkedBills === 1 ? "" : "s"} reference this PO. Void the bill(s) first.`,
    };
  }
  await db.purchaseOrder.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "PurchaseOrder", entityId: id, before: { number: po.number } });
  revalidatePath("/purchases/orders");
  return { ok: true };
}

/**
 * Bulk transitions used by the PO list page's
 * `<BulkAwareDataTable bulkActions={…}>`. Each returns the
 * `{ ok, updated?, error? }` shape the bulk table component expects.
 */
export async function bulkClosePurchaseOrdersAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.purchaseOrder.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      // Only Issued / Partially Billed / Billed POs can be closed.
      // Draft / Cancelled stay as-is.
      status: { in: ["ISSUED", "PARTIALLY_BILLED", "BILLED"] },
    },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "PurchaseOrder",
    entityId: `bulk-close-${Date.now()}`,
    after: { count: result.count, ids: input.ids },
  });
  revalidatePath("/purchases/orders");
  return { ok: true, updated: result.count };
}

export async function bulkCancelPurchaseOrdersAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  // Cancel any non-cancelled PO. Status = CANCELLED + cancelledAt
  // timestamp. P3-B will allow uncancel via a status toggle.
  const result = await db.purchaseOrder.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      status: { not: "CANCELLED" },
    },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "PurchaseOrder",
    entityId: `bulk-cancel-${Date.now()}`,
    after: { count: result.count, ids: input.ids },
  });
  revalidatePath("/purchases/orders");
  return { ok: true, updated: result.count };
}

export async function bulkDeletePurchaseOrdersAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const linkedBills = await db.bill.count({
    where: {
      purchaseOrderId: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
    },
  });
  if (linkedBills > 0) {
    return {
      ok: false,
      error: `${linkedBills} bill${linkedBills === 1 ? "" : "s"} reference the selected POs. Void those bills first.`,
    };
  }
  const result = await db.purchaseOrder.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "PurchaseOrder",
    entityId: `bulk-delete-${Date.now()}`,
    before: { count: result.count, ids: input.ids },
  });
  revalidatePath("/purchases/orders");
  return { ok: true, updated: result.count };
}
