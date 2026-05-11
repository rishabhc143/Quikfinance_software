"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getNextDocumentNumber } from "@/lib/sales/numbering";
import { computeDocument } from "@/lib/sales/totals";
import {
  purchaseOrderSchema,
  type PurchaseOrderInput,
} from "@/lib/validations/purchase-order";

/**
 * Purchase Order server actions.
 *
 * P3-B rewrite — replaces the thin SimpleDocForm createPurchaseOrder
 * with a full multi-line create + update flow mirroring the sales-
 * orders side. Both write inside `db.$transaction` so the PO row,
 * line items, and totals stay consistent.
 *
 * Totals math is delegated to `lib/sales/totals.ts` (`computeDocument`)
 * — the same Decimal-safe primitive sales uses, so PO and Sales Order
 * arithmetic don't diverge.
 *
 * Bulk actions (bulkClose / bulkCancel / bulkDelete) and the legacy
 * single deletePurchaseOrderAction remain at the bottom unchanged
 * from P3-A.
 */

async function totalsFor(orgId: string, input: PurchaseOrderInput) {
  const taxes = await db.tax.findMany({
    where: { organizationId: orgId, isActive: true },
    select: { id: true, rate: true },
  });
  const taxRate = (id?: string | null) =>
    (id ? taxes.find((t) => t.id === id)?.rate : null) ?? 0;
  const docTaxRate = input.documentTax
    ? Number(taxRate(input.documentTax.taxId))
    : 0;
  return computeDocument({
    lines: input.lines.map((l) => ({
      quantity: l.quantity ?? 0,
      rate: l.rate ?? 0,
      discount: l.discount ?? 0,
      discountType: l.discountType ?? "percentage",
      taxRate: Number(taxRate(l.taxId)),
    })),
    documentDiscount: input.documentDiscount
      ? {
          value: input.documentDiscount.value ?? 0,
          type: input.documentDiscount.type ?? "percentage",
        }
      : undefined,
    documentTax: input.documentTax
      ? { rate: docTaxRate, type: input.documentTax.type }
      : undefined,
    adjustment: input.adjustmentValue ?? 0,
  });
}

export async function createPurchaseOrderAction(
  input: PurchaseOrderInput,
  opts?: { send?: boolean }
) {
  const { user, organization } = await requireOrganization();
  const data = purchaseOrderSchema.parse(input);
  const number = await getNextDocumentNumber(organization.id, "PURCHASE_ORDER");
  const totals = await totalsFor(organization.id, data);

  // ISSUED on Save-and-Send; otherwise honor the caller's status
  // (Draft on Save-as-Draft).
  const status = opts?.send ? "ISSUED" : data.status;

  const created = await db.purchaseOrder.create({
    data: {
      organizationId: organization.id,
      number,
      referenceNumber: data.referenceNumber ?? null,
      contactId: data.contactId,
      status,
      orderDate: data.orderDate,
      deliveryDate: data.deliveryDate ?? null,
      paymentTermsId: data.paymentTermsId ?? null,
      shipmentPreferenceId: data.shipmentPreferenceId ?? null,
      deliveryAddressMode: data.deliveryAddressMode ?? "ORGANIZATION",
      deliveryToCustomerId: data.deliveryToCustomerId ?? null,
      deliveryAddressId: data.deliveryAddressId ?? null,
      placeOfSupply: data.placeOfSupply ?? null,
      currency: data.currency,
      subTotal: totals.subTotal,
      discountValue: data.documentDiscount?.value ?? 0,
      discountType: data.documentDiscount?.type ?? "percentage",
      taxType: data.documentTax?.type ?? null,
      taxId: data.documentTax?.taxId ?? null,
      taxAmount: totals.documentTaxAmount,
      adjustmentLabel: data.adjustmentLabel ?? "Adjustment",
      adjustmentValue: data.adjustmentValue ?? 0,
      total: totals.total,
      notes: data.notes ?? null,
      termsAndConditions: data.termsAndConditions ?? null,
      pdfTemplateId: data.pdfTemplateId ?? null,
      sentAt: opts?.send ? new Date() : null,
      attachments:
        data.attachments && data.attachments.length > 0
          ? {
              create: data.attachments.map((a) => ({
                fileName: a.fileName,
                fileUrl: a.fileUrl,
                fileSize: a.fileSize,
                mimeType: a.mimeType,
              })),
            }
          : undefined,
      lineItems: {
        create: data.lines.map((l, i) => ({
          itemId: l.itemId || null,
          position: l.position ?? i,
          name: l.name,
          description: l.description ?? null,
          hsnSacCode: l.hsnSacCode ?? null,
          accountId: l.accountId ?? null,
          quantity: l.quantity,
          unit: l.unit ?? null,
          rate: l.rate,
          discount: l.discount ?? 0,
          discountType: l.discountType ?? "percentage",
          taxId: l.taxId ?? null,
          taxAmount: totals.lines[i]?.taxAmount ?? 0,
          amount: totals.lines[i]?.amount ?? 0,
        })),
      },
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "PurchaseOrder",
    entityId: created.id,
    after: {
      number: created.number,
      total: totals.total,
      status: created.status,
    },
  });

  revalidatePath("/purchases/orders");
  redirect(`/purchases/orders/${created.id}`);
}

export async function updatePurchaseOrderAction(
  id: string,
  input: PurchaseOrderInput,
  opts?: { send?: boolean }
) {
  const { user, organization } = await requireOrganization();
  const data = purchaseOrderSchema.parse(input);
  const before = await db.purchaseOrder.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!before) throw new Error("Purchase order not found");
  if (before.status === "CLOSED" || before.status === "CANCELLED") {
    throw new Error("Closed or cancelled purchase orders cannot be edited");
  }
  const totals = await totalsFor(organization.id, data);

  // On Save-and-Send from edit: bump Draft → Issued. Otherwise keep
  // the existing status (don't accidentally regress a PARTIALLY_BILLED
  // PO back to Draft).
  const nextStatus =
    opts?.send && before.status === "DRAFT" ? "ISSUED" : before.status;

  await db.$transaction(async (tx) => {
    await tx.purchaseOrderLineItem.deleteMany({
      where: { purchaseOrderId: id },
    });
    await tx.purchaseOrder.update({
      where: { id },
      data: {
        referenceNumber: data.referenceNumber ?? null,
        contactId: data.contactId,
        status: nextStatus,
        orderDate: data.orderDate,
        deliveryDate: data.deliveryDate ?? null,
        paymentTermsId: data.paymentTermsId ?? null,
        shipmentPreferenceId: data.shipmentPreferenceId ?? null,
        deliveryAddressMode: data.deliveryAddressMode ?? "ORGANIZATION",
        deliveryToCustomerId: data.deliveryToCustomerId ?? null,
        deliveryAddressId: data.deliveryAddressId ?? null,
        placeOfSupply: data.placeOfSupply ?? null,
        currency: data.currency,
        subTotal: totals.subTotal,
        discountValue: data.documentDiscount?.value ?? 0,
        discountType: data.documentDiscount?.type ?? "percentage",
        taxType: data.documentTax?.type ?? null,
        taxId: data.documentTax?.taxId ?? null,
        taxAmount: totals.documentTaxAmount,
        adjustmentLabel: data.adjustmentLabel ?? "Adjustment",
        adjustmentValue: data.adjustmentValue ?? 0,
        total: totals.total,
        notes: data.notes ?? null,
        termsAndConditions: data.termsAndConditions ?? null,
        pdfTemplateId: data.pdfTemplateId ?? null,
        sentAt: opts?.send && !before.sentAt ? new Date() : before.sentAt,
        lineItems: {
          create: data.lines.map((l, i) => ({
            itemId: l.itemId || null,
            position: l.position ?? i,
            name: l.name,
            description: l.description ?? null,
            hsnSacCode: l.hsnSacCode ?? null,
            accountId: l.accountId ?? null,
            quantity: l.quantity,
            unit: l.unit ?? null,
            rate: l.rate,
            discount: l.discount ?? 0,
            discountType: l.discountType ?? "percentage",
            taxId: l.taxId ?? null,
            taxAmount: totals.lines[i]?.taxAmount ?? 0,
            amount: totals.lines[i]?.amount ?? 0,
          })),
        },
      },
    });
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "PurchaseOrder",
    entityId: id,
    before: {
      number: before.number,
      total: Number(before.total),
      status: before.status,
    },
    after: {
      number: before.number,
      total: totals.total,
      status: nextStatus,
    },
  });

  revalidatePath("/purchases/orders");
  revalidatePath(`/purchases/orders/${id}`);
  redirect(`/purchases/orders/${id}`);
}

export async function deletePurchaseOrderAction(id: string) {
  const { user, organization } = await requireOrganization();
  const po = await db.purchaseOrder.findFirst({
    where: { id, organizationId: organization.id },
  });
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
      error: `Cannot delete — ${linkedBills} bill${
        linkedBills === 1 ? "" : "s"
      } reference this PO. Void the bill(s) first.`,
    };
  }
  await db.purchaseOrder.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "PurchaseOrder",
    entityId: id,
    before: { number: po.number },
  });
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
      error: `${linkedBills} bill${
        linkedBills === 1 ? "" : "s"
      } reference the selected POs. Void those bills first.`,
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
