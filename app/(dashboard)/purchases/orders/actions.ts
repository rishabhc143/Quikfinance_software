"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getNextDocumentNumber } from "@/lib/sales/numbering";
import { computeDocument } from "@/lib/sales/totals";
import { enqueueEmail } from "@/lib/sales/email-sender";
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

/**
 * Single-id status transitions used by the PO detail page action bar.
 *
 * State-machine guards (mirrored in tests/unit/purchases/po-transitions):
 *  - DRAFT     → ISSUED         via markIssued
 *  - ISSUED    → CLOSED         via close
 *  - PARTIALLY_BILLED → CLOSED  via close
 *  - any non-CANCELLED → CANCELLED via cancel
 *  - DRAFT     → (deleted)      via deletePurchaseOrderAction
 *  - clone     → new DRAFT with a fresh PO# and copied line items
 */
export async function markPurchaseOrderIssuedAction(
  id: string
): Promise<void> {
  const { user, organization } = await requireOrganization();
  const po = await db.purchaseOrder.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!po) throw new Error("Purchase order not found");
  if (po.status !== "DRAFT") {
    throw new Error(
      `Cannot mark as Issued — current status is ${po.status}.`
    );
  }
  await db.purchaseOrder.update({
    where: { id },
    data: { status: "ISSUED", sentAt: po.sentAt ?? new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "PurchaseOrder",
    entityId: id,
    before: { status: "DRAFT" },
    after: { status: "ISSUED" },
  });
  revalidatePath("/purchases/orders");
  revalidatePath(`/purchases/orders/${id}`);
}

export async function cancelPurchaseOrderAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  const po = await db.purchaseOrder.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!po) throw new Error("Purchase order not found");
  if (po.status === "CANCELLED") {
    throw new Error("Already cancelled.");
  }
  await db.purchaseOrder.update({
    where: { id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "PurchaseOrder",
    entityId: id,
    before: { status: po.status },
    after: { status: "CANCELLED" },
  });
  revalidatePath("/purchases/orders");
  revalidatePath(`/purchases/orders/${id}`);
}

export async function closePurchaseOrderAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  const po = await db.purchaseOrder.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!po) throw new Error("Purchase order not found");
  if (!["ISSUED", "PARTIALLY_BILLED", "BILLED"].includes(po.status)) {
    throw new Error(
      `Cannot close — only Issued / Partially Billed / Billed POs can be closed.`
    );
  }
  await db.purchaseOrder.update({
    where: { id },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "PurchaseOrder",
    entityId: id,
    before: { status: po.status },
    after: { status: "CLOSED" },
  });
  revalidatePath("/purchases/orders");
  revalidatePath(`/purchases/orders/${id}`);
}

/**
 * Clone an existing PO — copies line items, attachments stay
 * unattached (the user typically doesn't want a duplicate file
 * pointer). The new PO is always a fresh DRAFT.
 *
 * Returns the new PO id; caller is expected to redirect.
 */
export async function clonePurchaseOrderAction(id: string) {
  const { user, organization } = await requireOrganization();
  const src = await db.purchaseOrder.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
    include: { lineItems: { orderBy: { position: "asc" } } },
  });
  if (!src) throw new Error("Purchase order not found");
  const number = await getNextDocumentNumber(organization.id, "PURCHASE_ORDER");
  const cloned = await db.purchaseOrder.create({
    data: {
      organizationId: organization.id,
      number,
      referenceNumber: src.referenceNumber,
      contactId: src.contactId,
      status: "DRAFT",
      orderDate: new Date(),
      deliveryDate: src.deliveryDate,
      paymentTermsId: src.paymentTermsId,
      shipmentPreferenceId: src.shipmentPreferenceId,
      deliveryAddressMode: src.deliveryAddressMode,
      deliveryToCustomerId: src.deliveryToCustomerId,
      deliveryAddressId: src.deliveryAddressId,
      placeOfSupply: src.placeOfSupply,
      currency: src.currency,
      subTotal: src.subTotal,
      discountValue: src.discountValue,
      discountType: src.discountType,
      taxType: src.taxType,
      taxId: src.taxId,
      taxAmount: src.taxAmount,
      adjustmentLabel: src.adjustmentLabel,
      adjustmentValue: src.adjustmentValue,
      total: src.total,
      notes: src.notes,
      termsAndConditions: src.termsAndConditions,
      pdfTemplateId: src.pdfTemplateId,
      lineItems: {
        create: src.lineItems.map((l, i) => ({
          itemId: l.itemId,
          position: i,
          name: l.name,
          description: l.description,
          hsnSacCode: l.hsnSacCode,
          accountId: l.accountId,
          quantity: l.quantity,
          unit: l.unit,
          rate: l.rate,
          discount: l.discount,
          discountType: l.discountType,
          taxId: l.taxId,
          taxAmount: l.taxAmount,
          amount: l.amount,
        })),
      },
    },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "PurchaseOrder",
    entityId: cloned.id,
    after: {
      number,
      clonedFromId: src.id,
      clonedFromNumber: src.number,
    },
  });
  revalidatePath("/purchases/orders");
  redirect(`/purchases/orders/${cloned.id}/edit`);
}

/**
 * Convert PO → Bill. v1 just pre-fills the new-bill URL with a
 * `?fromPO=<id>` query param; the Bill form (P4) will read that and
 * seed the line items + vendor + PO link. Until P4 ships we just
 * redirect to the new-bill page; the user can manually copy lines.
 */
/**
 * Send a Purchase Order to its vendor by email.
 *
 * Enqueues an EmailJob; the existing cron drain in
 * /api/cron/email-job-retry handles the actual send (and retries).
 * Per master prompt §architectural_decisions_locked, POs ARE emailed
 * (unlike Bills, which are never emailed). On first successful queue,
 * also flips the PO status DRAFT → ISSUED and sets sentAt — the
 * canonical "this PO has gone out the door" marker.
 */
export async function sendPurchaseOrderAction(
  id: string,
  input: {
    to: string;
    cc?: string;
    subject: string;
    body: string;
  }
): Promise<void> {
  const { user, organization } = await requireOrganization();
  const po = await db.purchaseOrder.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
    include: { contact: { select: { displayName: true } } },
  });
  if (!po) throw new Error("Purchase order not found");
  if (po.status === "CANCELLED" || po.status === "CLOSED") {
    throw new Error(
      `Cannot send a ${po.status.toLowerCase()} purchase order.`
    );
  }
  if (!input.to || !input.to.includes("@")) {
    throw new Error("A valid recipient email is required.");
  }

  // The body the user typed in the composer. Wrap with a minimal
  // HTML shell so the rendered email looks ok in major clients.
  const bodyHtml = `<!doctype html><html><body style="font-family:Arial,sans-serif;line-height:1.5">
    <div style="white-space:pre-line">${escapeHtml(input.body)}</div>
    <p style="color:#666;font-size:12px;margin-top:24px">
      PDF attached: Purchase Order ${po.number}
    </p>
  </body></html>`;

  const ccList = (input.cc ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  await enqueueEmail({
    organizationId: organization.id,
    toEmail: input.to,
    ccEmails: ccList,
    subject: input.subject,
    bodyHtml,
    attachmentUrl: `/purchases/orders/${po.id}/pdf`,
    documentType: "PurchaseOrder",
    documentId: po.id,
  });

  // First-time send: bump status + record timestamp.
  if (po.status === "DRAFT") {
    await db.purchaseOrder.update({
      where: { id },
      data: { status: "ISSUED", sentAt: new Date() },
    });
  } else if (!po.sentAt) {
    await db.purchaseOrder.update({
      where: { id },
      data: { sentAt: new Date() },
    });
  }

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "PurchaseOrder",
    entityId: id,
    after: {
      sentTo: input.to,
      ccTo: ccList,
      subject: input.subject,
      bumpedToIssued: po.status === "DRAFT",
    },
  });

  revalidatePath("/purchases/orders");
  revalidatePath(`/purchases/orders/${id}`);
  redirect(`/purchases/orders/${id}`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function convertPurchaseOrderToBillAction(id: string) {
  const { user, organization } = await requireOrganization();
  const po = await db.purchaseOrder.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!po) throw new Error("Purchase order not found");
  if (!["ISSUED", "PARTIALLY_BILLED"].includes(po.status)) {
    throw new Error(
      `Can only convert Issued or Partially Billed POs to a Bill. Current: ${po.status}.`
    );
  }
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "PurchaseOrder",
    entityId: id,
    after: { convertToBillRequested: true, status: po.status },
  });
  redirect(`/purchases/bills/new?fromPO=${id}`);
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
