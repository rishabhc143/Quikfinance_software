"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getNextDocumentNumber } from "@/lib/sales/numbering";
import { computeDocument } from "@/lib/sales/totals";
import {
  deliveryChallanSchema,
  type DeliveryChallanInput,
} from "@/lib/validations/delivery-challan";

async function totalsFor(orgId: string, input: DeliveryChallanInput) {
  const taxes = await db.tax.findMany({
    where: { organizationId: orgId, isActive: true },
    select: { id: true, rate: true },
  });
  const taxRate = (id?: string | null) =>
    (id ? taxes.find((t) => t.id === id)?.rate : null) ?? 0;
  return computeDocument({
    lines: input.lines.map((l) => ({
      quantity: l.quantity ?? 0,
      rate: l.rate ?? 0,
      discount: l.discount ?? 0,
      discountType: l.discountType ?? "percentage",
      taxRate: Number(taxRate(l.taxId)),
    })),
  });
}

export async function createDeliveryChallanAction(input: DeliveryChallanInput) {
  const { user, organization } = await requireOrganization();
  const data = deliveryChallanSchema.parse(input);
  const number = await getNextDocumentNumber(organization.id, "DELIVERY_CHALLAN");
  const totals = await totalsFor(organization.id, data);

  const created = await db.deliveryChallan.create({
    data: {
      organizationId: organization.id,
      number,
      referenceNumber: data.referenceNumber ?? null,
      contactId: data.contactId,
      status: "DRAFT",
      date: data.challanDate,
      challanType: data.challanType,
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

  // M25: persist custom field values
  if (data.customFieldValues && data.customFieldValues.length > 0) {
    await db.customFieldValue.createMany({
      data: data.customFieldValues.map((v) => ({
        organizationId: organization.id,
        entityType: "DELIVERY_CHALLAN",
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
    entityType: "DeliveryChallan",
    entityId: created.id,
    after: { number: created.number, status: created.status },
  });
  revalidatePath("/sales/delivery-challans");
  redirect(`/sales/delivery-challans/${created.id}`);
}

export async function markChallanDeliveredAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.deliveryChallan.update({
    where: { id },
    data: { status: "DELIVERED" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "DeliveryChallan",
    entityId: id,
    after: { status: "DELIVERED" },
  });
  revalidatePath(`/sales/delivery-challans/${id}`);
}

export async function markChallanReturnedAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.deliveryChallan.update({
    where: { id },
    data: { status: "RETURNED" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "DeliveryChallan",
    entityId: id,
    after: { status: "RETURNED" },
  });
  revalidatePath(`/sales/delivery-challans/${id}`);
}

/**
 * Convert a Delivery Challan to an Invoice. Mirrors the Quote → Invoice
 * conversion shape: copies line items, generates a fresh invoice number,
 * sets the DC status to INVOICED, and links via the invoice's
 * referenceNumber field (the DeliveryChallan model has no
 * convertedInvoiceId column — we reuse referenceNumber for the link).
 */
export async function convertChallanToInvoiceAction(
  challanId: string
): Promise<void> {
  const { user, organization } = await requireOrganization();
  const c = await db.deliveryChallan.findFirst({
    where: { id: challanId, organizationId: organization.id, deletedAt: null },
    include: { lineItems: true },
  });
  if (!c) throw new Error("Delivery challan not found");
  if (!c.contactId) throw new Error("Delivery challan has no customer");
  if (c.status === "INVOICED") {
    throw new Error("Already invoiced");
  }

  const invoiceNumber = await getNextDocumentNumber(organization.id, "INVOICE");
  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + 30);

  const lineTotals = c.lineItems.reduce(
    (acc, l) => acc + Number(l.amount),
    0
  );

  const inv = await db.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        organizationId: organization.id,
        number: invoiceNumber,
        referenceNumber: c.number,
        contactId: c.contactId!,
        status: "DRAFT",
        issueDate: today,
        dueDate,
        currency: "INR",
        subtotal: lineTotals,
        total: lineTotals,
        amountPaid: 0,
        notes: c.customerNotes,
        customerNotes: c.customerNotes,
        termsAndConditions: c.termsAndConditions,
        pdfTemplateId: c.pdfTemplateId,
        lineItems: {
          create: c.lineItems.map((l) => ({
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
    await tx.deliveryChallan.update({
      where: { id: challanId },
      data: { status: "INVOICED" },
    });
    return created;
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Invoice",
    entityId: inv.id,
    after: { number: inv.number, fromChallan: c.number },
  });
  revalidatePath("/sales/delivery-challans");
  revalidatePath("/sales/invoices");
  redirect(`/sales/invoices/${inv.id}`);
}

export async function deleteDeliveryChallanAction(id: string) {
  const { user, organization } = await requireOrganization();
  const c = await db.deliveryChallan.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!c) return { ok: false };
  await db.deliveryChallan.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "DeliveryChallan",
    entityId: id,
    before: { number: c.number },
  });
  revalidatePath("/sales/delivery-challans");
  return { ok: true };
}

/**
 * Bulk actions per <delivery_challans_spec> "Bulk: Mark Open, Print,
 * Email, Delete". DRAFT rows transition to OPEN; INVOICED/DELIVERED
 * rows are immutable so they're skipped.
 */
export async function bulkMarkChallansOpenAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.deliveryChallan.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      status: "DRAFT",
    },
    data: { status: "OPEN" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "DeliveryChallan",
    entityId: `bulk-${Date.now()}`,
    after: { status: "OPEN", count: result.count, ids: input.ids },
  });
  revalidatePath("/sales/delivery-challans");
  return { ok: true, updated: result.count };
}

export async function bulkDeleteDeliveryChallansAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  // Block delete on INVOICED challans (mirrors per-row guard)
  const blocked = await db.deliveryChallan.count({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      status: "INVOICED",
    },
  });
  if (blocked > 0) {
    return {
      ok: false,
      error: `${blocked} invoiced challan${blocked === 1 ? "" : "s"} cannot be deleted`,
    };
  }
  const result = await db.deliveryChallan.updateMany({
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
    entityType: "DeliveryChallan",
    entityId: `bulk-${Date.now()}`,
    before: { count: result.count, ids: input.ids },
  });
  revalidatePath("/sales/delivery-challans");
  return { ok: true, updated: result.count };
}
