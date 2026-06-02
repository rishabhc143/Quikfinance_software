"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getNextDocumentNumber } from "@/lib/sales/numbering";
import { computeDocumentTotals } from "@/lib/sales/document-totals";
import { enqueueEmail } from "@/lib/sales/email-sender";
import { renderSalesDocumentHtml } from "@/lib/sales/pdf-renderer";
import { loadVisibleCustomFields } from "@/lib/sales/custom-fields-loader";
import { salesOrderSchema, type SalesOrderInput } from "@/lib/validations/sales-order";
import { reserveStock, releaseStock } from "@/lib/inventory/reservations";
import { applyInvoiceStockDecrement } from "@/lib/inventory/stock-mutations";
import { format } from "date-fns";

export async function createSalesOrderAction(
  input: SalesOrderInput,
  opts?: { send?: boolean }
) {
  const { user, organization } = await requireOrganization();
  const data = salesOrderSchema.parse(input);
  const number = await getNextDocumentNumber(organization.id, "SALES_ORDER");
  const totals = await computeDocumentTotals(organization.id, data);

  const created = await db.salesOrder.create({
    data: {
      organizationId: organization.id,
      number,
      referenceNumber: data.referenceNumber ?? null,
      contactId: data.contactId,
      status: opts?.send ? "CONFIRMED" : data.status,
      orderDate: data.orderDate,
      expectedShipmentDate: data.expectedShipmentDate ?? null,
      paymentTermsId: data.paymentTermsId ?? null,
      deliveryMethodId: data.deliveryMethodId ?? null,
      salespersonId: data.salespersonId ?? null,
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
      customerNotes: data.customerNotes ?? null,
      termsAndConditions: data.termsAndConditions ?? null,
      pdfTemplateId: data.pdfTemplateId ?? null,
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

  // M21: persist custom field values
  if (data.customFieldValues && data.customFieldValues.length > 0) {
    await db.customFieldValue.createMany({
      data: data.customFieldValues.map((v) => ({
        organizationId: organization.id,
        entityType: "SALES_ORDER",
        entityId: created.id,
        fieldDefinitionId: v.fieldDefinitionId,
        value: v.value as object,
      })),
      skipDuplicates: true,
    });
  }

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "SalesOrder",
    entityId: created.id,
    after: { number: created.number, total: totals.total, status: created.status },
  });

  if (opts?.send) await enqueueAndAttach(organization.id, created.id);
  revalidatePath("/sales/orders");
  redirect(`/sales/orders/${created.id}`);
}

export async function updateSalesOrderAction(id: string, input: SalesOrderInput) {
  const { user, organization } = await requireOrganization();
  const data = salesOrderSchema.parse(input);
  const before = await db.salesOrder.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!before) throw new Error("Sales order not found");
  if (before.status === "CLOSED" || before.status === "VOID") {
    throw new Error("Closed or void sales orders cannot be edited");
  }
  const totals = await computeDocumentTotals(organization.id, data);

  await db.$transaction(async (tx) => {
    await tx.salesOrderLineItem.deleteMany({ where: { salesOrderId: id } });
    await tx.salesOrder.update({
      where: { id },
      data: {
        referenceNumber: data.referenceNumber ?? null,
        contactId: data.contactId,
        orderDate: data.orderDate,
        expectedShipmentDate: data.expectedShipmentDate ?? null,
        paymentTermsId: data.paymentTermsId ?? null,
        deliveryMethodId: data.deliveryMethodId ?? null,
        salespersonId: data.salespersonId ?? null,
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
        customerNotes: data.customerNotes ?? null,
        termsAndConditions: data.termsAndConditions ?? null,
        pdfTemplateId: data.pdfTemplateId ?? null,
        lineItems: {
          create: data.lines.map((l, i) => ({
            itemId: l.itemId || null,
            position: l.position ?? i,
            name: l.name,
            description: l.description ?? null,
            hsnSacCode: l.hsnSacCode ?? null,
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
    // M21: replace custom field values wholesale
    await tx.customFieldValue.deleteMany({
      where: {
        organizationId: organization.id,
        entityType: "SALES_ORDER",
        entityId: id,
      },
    });
    if (data.customFieldValues && data.customFieldValues.length > 0) {
      await tx.customFieldValue.createMany({
        data: data.customFieldValues.map((v) => ({
          organizationId: organization.id,
          entityType: "SALES_ORDER",
          entityId: id,
          fieldDefinitionId: v.fieldDefinitionId,
          value: v.value as object,
        })),
        skipDuplicates: true,
      });
    }
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "SalesOrder",
    entityId: id,
    before: { total: before.total.toString() },
    after: { total: totals.total },
  });
  revalidatePath("/sales/orders");
  revalidatePath(`/sales/orders/${id}`);
  redirect(`/sales/orders/${id}`);
}

export async function confirmSalesOrderAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  const so = await db.salesOrder.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
    include: { lineItems: true },
  });
  if (!so) throw new Error("Sales Order not found");

  await db.$transaction(async (tx) => {
    await tx.salesOrder.update({
      where: { id },
      data: { status: "CONFIRMED" },
    });
    // Reserve stock for every tracked item on the SO. reserveStock
    // is idempotent — re-confirming an already-confirmed SO is safe.
    await reserveStock(
      tx,
      organization.id,
      { type: "SalesOrder", id: so.id, number: so.number },
      so.lineItems.map((l) => ({ itemId: l.itemId, quantity: l.quantity }))
    );
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "SalesOrder",
    entityId: id,
    after: { status: "CONFIRMED" },
  });
  revalidatePath(`/sales/orders/${id}`);
}

export async function closeSalesOrderAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.$transaction(async (tx) => {
    await tx.salesOrder.update({
      where: { id },
      data: { status: "CLOSED" },
    });
    // Closed = order completed. If any reservations are still active
    // (i.e., the SO was closed without ever shipping via a DC), free
    // them now. consumed/released rows stay untouched.
    await releaseStock(tx, organization.id, "SalesOrder", id);
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "SalesOrder",
    entityId: id,
    after: { status: "CLOSED" },
  });
  revalidatePath(`/sales/orders/${id}`);
}

export async function convertSalesOrderToInvoiceAction(soId: string) {
  const { user, organization } = await requireOrganization();
  const so = await db.salesOrder.findFirst({
    where: { id: soId, organizationId: organization.id, deletedAt: null },
    include: { lineItems: true },
  });
  if (!so) throw new Error("Sales order not found");
  if (so.convertedInvoiceId) {
    redirect(`/sales/invoices/${so.convertedInvoiceId}`);
  }

  const invoiceNumber = await getNextDocumentNumber(organization.id, "INVOICE");
  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + 30);

  const inv = await db.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        organizationId: organization.id,
        number: invoiceNumber,
        referenceNumber: so.number,
        contactId: so.contactId,
        status: "DRAFT",
        issueDate: today,
        dueDate,
        salespersonId: so.salespersonId,
        currency: so.currency,
        subtotal: so.subTotal,
        discountValue: so.discountValue,
        discountType: so.discountType,
        taxType: so.taxType,
        taxId: so.taxId,
        taxTotal: so.taxAmount,
        adjustmentLabel: so.adjustmentLabel,
        adjustmentValue: so.adjustmentValue,
        total: so.total,
        amountPaid: 0,
        notes: so.customerNotes,
        customerNotes: so.customerNotes,
        termsAndConditions: so.termsAndConditions,
        pdfTemplateId: so.pdfTemplateId,
        lineItems: {
          create: so.lineItems.map((l) => ({
            itemId: l.itemId,
            description: l.description ?? l.name,
            quantity: l.quantity,
            rate: l.rate,
            taxId: l.taxId,
            amount: l.amount,
          })),
        },
      },
    });
    await tx.salesOrder.update({
      where: { id: soId },
      data: { status: "CLOSED", convertedInvoiceId: created.id },
    });
    // Stock bookkeeping:
    //  - Release any SO reservations (the invoice is the new source
    //    of truth for the sale)
    //  - Decrement on-hand for every tracked line on the new invoice
    await releaseStock(tx, organization.id, "SalesOrder", soId);
    await applyInvoiceStockDecrement(
      tx,
      organization.id,
      { number: created.number, date: created.issueDate },
      so.lineItems.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        description: l.description ?? l.name,
      }))
    );
    return created;
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Invoice",
    entityId: inv.id,
    after: { number: inv.number, fromSalesOrder: so.number },
  });
  revalidatePath("/sales/orders");
  revalidatePath("/sales/invoices");
  redirect(`/sales/invoices/${inv.id}`);
}

/**
 * Convert SO → Purchase Order. Phase S4 stubs the Purchases module integration:
 * if the PurchaseOrder model supports a one-line creation we'll attempt it,
 * otherwise we toast that Purchases module is pending.
 */
export async function convertSalesOrderToPurchaseOrderAction(soId: string) {
  const { user, organization } = await requireOrganization();
  const so = await db.salesOrder.findFirst({
    where: { id: soId, organizationId: organization.id, deletedAt: null },
  });
  if (!so) throw new Error("Sales order not found");

  // Existing PurchaseOrder model is minimal — no line items relation. Create a
  // placeholder PO row so the round-trip works end-to-end; richer Purchases
  // module wiring is its own scope.
  const poNumber = await getNextDocumentNumber(organization.id, "PAYMENT_RECEIVED")
    .catch(() => `PO-${Date.now().toString().slice(-6)}`);

  const po = await db.purchaseOrder.create({
    data: {
      organizationId: organization.id,
      number: poNumber,
      contactId: so.contactId,
      status: "draft",
      orderDate: new Date(),
      total: so.total,
    },
  });
  await db.salesOrder.update({
    where: { id: soId },
    data: { convertedPurchaseOrderId: po.id },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "PurchaseOrder",
    entityId: po.id,
    after: { number: po.number, fromSalesOrder: so.number },
  });
  revalidatePath("/sales/orders");
  redirect(`/purchases/orders`);
}

export async function deleteSalesOrderAction(id: string) {
  const { user, organization } = await requireOrganization();
  const so = await db.salesOrder.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!so) return { ok: false };
  if (so.convertedInvoiceId) {
    return { ok: false, error: "Sales order already invoiced" };
  }
  await db.$transaction(async (tx) => {
    await tx.salesOrder.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    // Free any reserved stock so it's available again.
    await releaseStock(tx, organization.id, "SalesOrder", id);
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "SalesOrder",
    entityId: id,
    before: { number: so.number },
  });
  revalidatePath("/sales/orders");
  return { ok: true };
}

async function enqueueAndAttach(orgId: string, soId: string) {
  const so = await db.salesOrder.findUnique({
    where: { id: soId },
    include: { contact: true, lineItems: true, organization: true },
  });
  if (!so || !so.contact.email) return;
  // M22: include showOnPdf custom fields in the email-attached HTML body
  const customFields = await loadVisibleCustomFields({
    organizationId: orgId,
    entityType: "SALES_ORDER",
    entityId: so.id,
    surface: "pdf",
  });
  const html = renderSalesDocumentHtml({
    type: "SALES_ORDER",
    organization: { name: so.organization.name },
    document: {
      number: so.number,
      date: format(so.orderDate, "dd MMM yyyy"),
      referenceNumber: so.referenceNumber,
      status: so.status,
    },
    customer: { displayName: so.contact.displayName, email: so.contact.email },
    lines: so.lineItems.map((l) => ({
      name: l.name,
      description: l.description,
      quantity: l.quantity.toString(),
      rate: l.rate.toString(),
      amount: l.amount.toString(),
    })),
    totals: {
      lines: so.lineItems.map((l) => ({
        amount: l.amount.toString(),
        taxAmount: l.taxAmount.toString(),
        amountWithTax: l.amount.toString(),
      })),
      subTotal: so.subTotal.toString(),
      documentDiscountAmount: so.discountValue.toString(),
      documentTaxAmount: so.taxAmount.toString(),
      adjustmentAmount: so.adjustmentValue.toString(),
      total: so.total.toString(),
    },
    notes: so.customerNotes,
    termsAndConditions: so.termsAndConditions,
    customFields,
  });
  await enqueueEmail({
    organizationId: orgId,
    toEmail: so.contact.email,
    subject: `Sales Order ${so.number} from ${so.organization.name}`,
    bodyHtml: `<p>Hello ${so.contact.displayName},</p><p>Your sales order ${so.number} is attached.</p>${html}`,
    documentType: "SALES_ORDER",
    documentId: so.id,
  });
}

/**
 * Bulk actions per <sales_orders_spec> "Bulk actions: Mark as Open, Print,
 * Email, Delete". Print/Email deferred. CONFIRMED is the SO equivalent of
 * "Open" in the spec — DRAFT rows transition there.
 */
export async function bulkMarkSalesOrdersOpenAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  // Fetch the DRAFT orders we're about to confirm so we can reserve
  // stock for their line items. We need lineItems + number, hence a
  // findMany rather than the bulk updateMany.
  const drafts = await db.salesOrder.findMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      status: "DRAFT",
    },
    include: { lineItems: true },
  });
  let count = 0;
  for (const so of drafts) {
    await db.$transaction(async (tx) => {
      await tx.salesOrder.update({
        where: { id: so.id },
        data: { status: "CONFIRMED" },
      });
      await reserveStock(
        tx,
        organization.id,
        { type: "SalesOrder", id: so.id, number: so.number },
        so.lineItems.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
        }))
      );
    });
    count += 1;
  }
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "SalesOrder",
    entityId: `bulk-${Date.now()}`,
    after: { status: "CONFIRMED", count, ids: input.ids },
  });
  revalidatePath("/sales/orders");
  return { ok: true, updated: count };
}

export async function bulkDeleteSalesOrdersAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  // Block delete on CLOSED orders that already produced invoices
  const blocked = await db.salesOrder.count({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      status: "CLOSED",
    },
  });
  if (blocked > 0) {
    return {
      ok: false,
      error: `${blocked} closed order${blocked === 1 ? "" : "s"} cannot be deleted`,
    };
  }
  const result = await db.salesOrder.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });
  // Release any active reservations tied to these SOs. updateMany
  // doesn't give us per-row context but releaseStock is per-source,
  // so iterate.
  for (const id of input.ids) {
    await releaseStock(db, organization.id, "SalesOrder", id);
  }
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "SalesOrder",
    entityId: `bulk-${Date.now()}`,
    before: { count: result.count, ids: input.ids },
  });
  revalidatePath("/sales/orders");
  return { ok: true, updated: result.count };
}

/**
 * Bulk email per <sales_orders_spec> "Bulk: Email". Skips orders whose
 * customer has no email on file.
 */
export async function bulkEmailSalesOrdersAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const targets = await db.salesOrder.findMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    select: { id: true, contact: { select: { email: true } } },
  });
  let queued = 0;
  for (const t of targets) {
    if (!t.contact?.email) continue;
    await enqueueAndAttach(organization.id, t.id);
    queued += 1;
  }
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "SalesOrderEmailBulk",
    entityId: `bulk-${Date.now()}`,
    after: { queued, ids: input.ids },
  });
  revalidatePath("/sales/orders");
  return { ok: true, updated: queued };
}
