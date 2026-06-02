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
import { applyMergeTags } from "@/lib/sales/merge-tags";
import { quoteSchema, type QuoteInput } from "@/lib/validations/quote";
import { format } from "date-fns";

export async function createQuoteAction(input: QuoteInput, opts?: { send?: boolean }) {
  const { user, organization } = await requireOrganization();
  const data = quoteSchema.parse(input);
  const number = await getNextDocumentNumber(organization.id, "QUOTE");
  const totals = await computeDocumentTotals(organization.id, data);

  const created = await db.$transaction(async (tx) => {
    const q = await tx.quote.create({
      data: {
        organizationId: organization.id,
        number,
        referenceNumber: data.referenceNumber ?? null,
        contactId: data.contactId,
        status: opts?.send ? "SENT" : data.status,
        issueDate: data.quoteDate,
        expiryDate: data.expiryDate ?? null,
        salespersonId: data.salespersonId ?? null,
        projectId: data.projectId ?? null,
        subject: data.subject ?? null,
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
    return q;
  });

  // M21: persist custom field values
  if (data.customFieldValues && data.customFieldValues.length > 0) {
    await db.customFieldValue.createMany({
      data: data.customFieldValues.map((v) => ({
        organizationId: organization.id,
        entityType: "QUOTE",
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
    entityType: "Quote",
    entityId: created.id,
    after: { number: created.number, total: totals.total, status: created.status },
  });

  if (opts?.send) {
    await enqueueAndAttach(organization.id, created.id);
  }

  revalidatePath("/sales/quotes");
  redirect(`/sales/quotes/${created.id}`);
}

export async function updateQuoteAction(id: string, input: QuoteInput) {
  const { user, organization } = await requireOrganization();
  const data = quoteSchema.parse(input);
  const before = await db.quote.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!before) throw new Error("Quote not found");
  if (before.status === "INVOICED") {
    throw new Error("Invoiced quotes cannot be edited");
  }
  const totals = await computeDocumentTotals(organization.id, data);

  await db.$transaction(async (tx) => {
    await tx.quoteLineItem.deleteMany({ where: { quoteId: id } });
    await tx.quote.update({
      where: { id },
      data: {
        referenceNumber: data.referenceNumber ?? null,
        contactId: data.contactId,
        issueDate: data.quoteDate,
        expiryDate: data.expiryDate ?? null,
        salespersonId: data.salespersonId ?? null,
        projectId: data.projectId ?? null,
        subject: data.subject ?? null,
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
        entityType: "QUOTE",
        entityId: id,
      },
    });
    if (data.customFieldValues && data.customFieldValues.length > 0) {
      await tx.customFieldValue.createMany({
        data: data.customFieldValues.map((v) => ({
          organizationId: organization.id,
          entityType: "QUOTE",
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
    entityType: "Quote",
    entityId: id,
    before: { total: before.total.toString() },
    after: { total: totals.total },
  });
  revalidatePath("/sales/quotes");
  revalidatePath(`/sales/quotes/${id}`);
  redirect(`/sales/quotes/${id}`);
}

/**
 * Send Quote modal action — used by the <SaveAndSendDialog> on the
 * Quote detail page. Accepts merchant-edited subject/body with merge
 * tags + To/Cc + scheduledFor + attachPdf flag (PDF attachment URL is
 * derived from the public PDF route).
 */
export async function sendQuoteWithEmailAction(input: {
  documentId: string;
  to: string;
  cc?: string[];
  subject: string;
  bodyHtml: string;
  attachPdf: boolean;
  scheduledFor?: Date | string | null;
}): Promise<void> {
  const { user, organization } = await requireOrganization();
  const q = await db.quote.findFirst({
    where: { id: input.documentId, organizationId: organization.id, deletedAt: null },
    include: { contact: true, organization: true },
  });
  if (!q) throw new Error("Quote not found");

  const ctx = {
    customerName: q.contact.displayName,
    customerEmail: q.contact.email,
    documentNumber: q.number,
    documentTotal: q.total.toString(),
    documentDate: format(q.issueDate, "dd MMM yyyy"),
    documentDueDate: q.expiryDate ? format(q.expiryDate, "dd MMM yyyy") : null,
    orgName: q.organization.name,
  };
  const renderedSubject = applyMergeTags(input.subject, ctx);
  const renderedBody = applyMergeTags(input.bodyHtml, ctx);

  const scheduledFor =
    input.scheduledFor instanceof Date
      ? input.scheduledFor
      : input.scheduledFor
      ? new Date(input.scheduledFor)
      : new Date();

  await enqueueEmail({
    organizationId: organization.id,
    toEmail: input.to,
    ccEmails: input.cc,
    subject: renderedSubject,
    bodyHtml: renderedBody,
    documentType: "QUOTE",
    documentId: q.id,
    scheduledFor,
  });

  // Flip status to SENT if not already past it
  if (q.status === "DRAFT") {
    await db.quote.update({
      where: { id: q.id },
      data: { status: "SENT", sentAt: new Date() },
    });
  }

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Quote",
    entityId: q.id,
    after: {
      sent: true,
      to: input.to,
      attachPdf: input.attachPdf,
      scheduledFor: scheduledFor.toISOString(),
    },
  });

  revalidatePath(`/sales/quotes/${q.id}`);
  revalidatePath("/sales/quotes");
}

export async function markQuoteSentAction(id: string) {
  const { user, organization } = await requireOrganization();
  const q = await db.quote.findFirst({ where: { id, organizationId: organization.id } });
  if (!q) return { ok: false };
  await db.quote.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date() },
  });
  await enqueueAndAttach(organization.id, id);
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Quote",
    entityId: id,
    after: { status: "SENT" },
  });
  revalidatePath(`/sales/quotes/${id}`);
  revalidatePath("/sales/quotes");
  return { ok: true };
}

export async function markQuoteAcceptedAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.quote.update({
    where: { id },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Quote",
    entityId: id,
    after: { status: "ACCEPTED" },
  });
  revalidatePath(`/sales/quotes/${id}`);
  revalidatePath("/sales/quotes");
  return { ok: true };
}

export async function markQuoteDeclinedAction(id: string) {
  const { user, organization } = await requireOrganization();
  await db.quote.update({
    where: { id },
    data: { status: "DECLINED", declinedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Quote",
    entityId: id,
    after: { status: "DECLINED" },
  });
  revalidatePath(`/sales/quotes/${id}`);
  revalidatePath("/sales/quotes");
  return { ok: true };
}

export async function convertQuoteToInvoiceAction(quoteId: string) {
  const { user, organization } = await requireOrganization();
  const q = await db.quote.findFirst({
    where: { id: quoteId, organizationId: organization.id },
    include: { lineItems: true },
  });
  if (!q) throw new Error("Quote not found");
  if (q.convertedInvoiceId) {
    redirect(`/sales/invoices/${q.convertedInvoiceId}`);
  }

  const invoiceNumber = await getNextDocumentNumber(organization.id, "INVOICE");
  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + 30);

  const invoice = await db.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        organizationId: organization.id,
        number: invoiceNumber,
        referenceNumber: q.number,
        contactId: q.contactId,
        status: "DRAFT",
        issueDate: today,
        dueDate,
        salespersonId: q.salespersonId,
        projectId: q.projectId,
        currency: q.currency,
        subtotal: q.subTotal,
        discountValue: q.discountValue,
        discountType: q.discountType,
        taxType: q.taxType,
        taxId: q.taxId,
        taxTotal: q.taxAmount,
        adjustmentLabel: q.adjustmentLabel,
        adjustmentValue: q.adjustmentValue,
        total: q.total,
        amountPaid: 0,
        notes: q.customerNotes,
        customerNotes: q.customerNotes,
        termsAndConditions: q.termsAndConditions,
        pdfTemplateId: q.pdfTemplateId,
        lineItems: {
          create: q.lineItems.map((l) => ({
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
    await tx.quote.update({
      where: { id: quoteId },
      data: { status: "INVOICED", convertedInvoiceId: inv.id },
    });
    return inv;
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Invoice",
    entityId: invoice.id,
    after: { number: invoice.number, fromQuote: q.number },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Quote",
    entityId: quoteId,
    after: { status: "INVOICED", invoiceId: invoice.id },
  });

  revalidatePath("/sales/quotes");
  revalidatePath("/sales/invoices");
  redirect(`/sales/invoices/${invoice.id}`);
}

export async function convertQuoteToSalesOrderAction(quoteId: string) {
  const { user, organization } = await requireOrganization();
  const q = await db.quote.findFirst({
    where: { id: quoteId, organizationId: organization.id },
    include: { lineItems: true },
  });
  if (!q) throw new Error("Quote not found");
  if (q.convertedSalesOrderId) {
    redirect(`/sales/orders/${q.convertedSalesOrderId}`);
  }

  const soNumber = await getNextDocumentNumber(organization.id, "SALES_ORDER");
  const so = await db.$transaction(async (tx) => {
    const created = await tx.salesOrder.create({
      data: {
        organizationId: organization.id,
        number: soNumber,
        referenceNumber: q.number,
        contactId: q.contactId,
        status: "DRAFT",
        orderDate: new Date(),
        salespersonId: q.salespersonId,
        currency: q.currency,
        subTotal: q.subTotal,
        discountValue: q.discountValue,
        discountType: q.discountType,
        taxType: q.taxType,
        taxId: q.taxId,
        taxAmount: q.taxAmount,
        adjustmentLabel: q.adjustmentLabel,
        adjustmentValue: q.adjustmentValue,
        total: q.total,
        customerNotes: q.customerNotes,
        termsAndConditions: q.termsAndConditions,
        pdfTemplateId: q.pdfTemplateId,
        lineItems: {
          create: q.lineItems.map((l, i) => ({
            itemId: l.itemId,
            position: l.position ?? i,
            name: l.name,
            description: l.description,
            hsnSacCode: l.hsnSacCode,
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
    await tx.quote.update({
      where: { id: quoteId },
      data: { convertedSalesOrderId: created.id },
    });
    return created;
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "SalesOrder",
    entityId: so.id,
    after: { number: so.number, fromQuote: q.number },
  });
  revalidatePath("/sales/orders");
  redirect(`/sales/orders/${so.id}`);
}

export async function deleteQuoteAction(id: string) {
  const { user, organization } = await requireOrganization();
  const q = await db.quote.findFirst({ where: { id, organizationId: organization.id } });
  if (!q) return { ok: false };
  if (q.status === "INVOICED") {
    return { ok: false, error: "Invoiced quotes cannot be deleted" };
  }
  await db.quote.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "Quote",
    entityId: id,
    before: { number: q.number },
  });
  revalidatePath("/sales/quotes");
  return { ok: true };
}

async function enqueueAndAttach(orgId: string, quoteId: string) {
  const q = await db.quote.findUnique({
    where: { id: quoteId },
    include: { contact: true, lineItems: true, organization: true },
  });
  if (!q || !q.contact.email) return;
  // M22: include showOnPdf custom fields in the email-attached HTML body
  const customFields = await loadVisibleCustomFields({
    organizationId: orgId,
    entityType: "QUOTE",
    entityId: q.id,
    surface: "pdf",
  });
  const html = renderSalesDocumentHtml({
    type: "QUOTE",
    organization: { name: q.organization.name },
    document: {
      number: q.number,
      date: format(q.issueDate, "dd MMM yyyy"),
      dueDate: q.expiryDate ? format(q.expiryDate, "dd MMM yyyy") : undefined,
      referenceNumber: q.referenceNumber,
      subject: q.subject,
      status: q.status,
    },
    customer: { displayName: q.contact.displayName, email: q.contact.email },
    lines: q.lineItems.map((l) => ({
      name: l.name,
      description: l.description,
      quantity: l.quantity.toString(),
      rate: l.rate.toString(),
      amount: l.amount.toString(),
    })),
    totals: {
      lines: q.lineItems.map((l) => ({
        amount: l.amount.toString(),
        taxAmount: l.taxAmount.toString(),
        amountWithTax: l.amount.toString(),
      })),
      subTotal: q.subTotal.toString(),
      documentDiscountAmount: q.discountValue.toString(),
      documentTaxAmount: q.taxAmount.toString(),
      adjustmentAmount: q.adjustmentValue.toString(),
      total: q.total.toString(),
    },
    notes: q.customerNotes,
    termsAndConditions: q.termsAndConditions,
    customFields,
  });
  await enqueueEmail({
    organizationId: orgId,
    toEmail: q.contact.email,
    subject: `Quote ${q.number} from ${q.organization.name}`,
    bodyHtml: `<p>Hello ${q.contact.displayName},</p><p>Please find your quote ${q.number} attached.</p>${html}`,
    documentType: "QUOTE",
    documentId: q.id,
  });
}

/**
 * Bulk actions per <quotes_spec> "Bulk actions: Mark Sent, Mark Accepted,
 * Print, Email, Delete". Print/Email are deferred — they need PDF-batch +
 * email-fanout plumbing.
 *
 * Each action is multi-tenant (orgId guard), writes a single AuditLog
 * row per call (with the count + ids in `after`), and revalidates the
 * list path. INVOICED quotes are immutable so they're skipped by status.
 */
export async function bulkMarkQuotesSentAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.quote.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      status: "DRAFT",
    },
    data: { status: "SENT", sentAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Quote",
    entityId: `bulk-${Date.now()}`,
    after: { status: "SENT", count: result.count, ids: input.ids },
  });
  revalidatePath("/sales/quotes");
  return { ok: true, updated: result.count };
}

export async function bulkMarkQuotesAcceptedAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.quote.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      status: { in: ["DRAFT", "SENT"] },
    },
    data: { status: "ACCEPTED" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Quote",
    entityId: `bulk-${Date.now()}`,
    after: { status: "ACCEPTED", count: result.count, ids: input.ids },
  });
  revalidatePath("/sales/quotes");
  return { ok: true, updated: result.count };
}

export async function bulkDeleteQuotesAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  // Block delete on INVOICED quotes (mirrors per-row guard)
  const blocked = await db.quote.count({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      status: "INVOICED",
    },
  });
  if (blocked > 0) {
    return {
      ok: false,
      error: `${blocked} invoiced quote${blocked === 1 ? "" : "s"} cannot be deleted`,
    };
  }
  const result = await db.quote.updateMany({
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
    entityType: "Quote",
    entityId: `bulk-${Date.now()}`,
    before: { count: result.count, ids: input.ids },
  });
  revalidatePath("/sales/quotes");
  return { ok: true, updated: result.count };
}

/**
 * Bulk email per <quotes_spec> "Bulk: Email". Fans the existing
 * single-doc enqueueAndAttach across selected ids; quotes whose
 * customer has no email are skipped silently.
 */
export async function bulkEmailQuotesAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const targets = await db.quote.findMany({
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
    entityType: "QuoteEmailBulk",
    entityId: `bulk-${Date.now()}`,
    after: { queued, ids: input.ids },
  });
  revalidatePath("/sales/quotes");
  return { ok: true, updated: queued };
}
