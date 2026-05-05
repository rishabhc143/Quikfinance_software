"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getNextDocumentNumber } from "@/lib/sales/numbering";
import { computeDocument } from "@/lib/sales/totals";
import { enqueueEmail } from "@/lib/sales/email-sender";
import { renderSalesDocumentHtml } from "@/lib/sales/pdf-renderer";
import {
  invoiceSchema,
  recordPaymentSchema,
  type InvoiceInput,
  type RecordPaymentInput,
} from "@/lib/validations/invoice";
import { format } from "date-fns";

async function totalsFor(orgId: string, input: InvoiceInput) {
  const taxes = await db.tax.findMany({
    where: { organizationId: orgId, isActive: true },
    select: { id: true, rate: true },
  });
  const taxRate = (id?: string | null) =>
    (id ? taxes.find((t) => t.id === id)?.rate : null) ?? 0;
  const docTaxRate = input.documentTax ? Number(taxRate(input.documentTax.taxId)) : 0;
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

export async function createInvoiceAction(
  input: InvoiceInput,
  opts?: { send?: boolean }
) {
  const { user, organization } = await requireOrganization();
  const data = invoiceSchema.parse(input);
  const number = await getNextDocumentNumber(organization.id, "INVOICE");
  const totals = await totalsFor(organization.id, data);

  const created = await db.invoice.create({
    data: {
      organizationId: organization.id,
      number,
      referenceNumber: data.referenceNumber ?? null,
      contactId: data.contactId,
      status: opts?.send ? "SENT" : data.status,
      issueDate: data.invoiceDate,
      dueDate: data.dueDate,
      paymentTermsId: data.paymentTermsId ?? null,
      salespersonId: data.salespersonId ?? null,
      projectId: data.projectId ?? null,
      currency: data.currency,
      subtotal: totals.subTotal,
      discountValue: data.documentDiscount?.value ?? 0,
      discountType: data.documentDiscount?.type ?? "percentage",
      taxType: data.documentTax?.type ?? null,
      taxId: data.documentTax?.taxId ?? null,
      taxTotal: totals.documentTaxAmount,
      adjustmentLabel: data.adjustmentLabel ?? "Adjustment",
      adjustmentValue: data.adjustmentValue ?? 0,
      total: totals.total,
      amountPaid: 0,
      notes: data.customerNotes,
      customerNotes: data.customerNotes ?? null,
      termsAndConditions: data.termsAndConditions ?? null,
      pdfTemplateId: data.pdfTemplateId ?? null,
      sentAt: opts?.send ? new Date() : null,
      lineItems: {
        create: data.lines.map((l) => ({
          itemId: l.itemId || null,
          description: l.description ?? l.name,
          quantity: l.quantity,
          rate: l.rate,
          taxId: l.taxId ?? null,
          amount:
            (Number(totals.lines[data.lines.indexOf(l)]?.amount ?? 0) || 0),
        })),
      },
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Invoice",
    entityId: created.id,
    after: { number: created.number, total: totals.total, status: created.status },
  });

  if (opts?.send) await enqueueAndAttach(organization.id, created.id);
  revalidatePath("/sales/invoices");
  redirect(`/sales/invoices/${created.id}`);
}

export async function updateInvoiceAction(id: string, input: InvoiceInput) {
  const { user, organization } = await requireOrganization();
  const data = invoiceSchema.parse(input);
  const before = await db.invoice.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!before) throw new Error("Invoice not found");
  if (before.status === "PAID" || before.status === "VOID" || before.status === "WRITTEN_OFF") {
    throw new Error("Paid, void, or written-off invoices cannot be edited");
  }
  const totals = await totalsFor(organization.id, data);

  await db.$transaction(async (tx) => {
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
    await tx.invoice.update({
      where: { id },
      data: {
        referenceNumber: data.referenceNumber ?? null,
        contactId: data.contactId,
        issueDate: data.invoiceDate,
        dueDate: data.dueDate,
        paymentTermsId: data.paymentTermsId ?? null,
        salespersonId: data.salespersonId ?? null,
        projectId: data.projectId ?? null,
        currency: data.currency,
        subtotal: totals.subTotal,
        discountValue: data.documentDiscount?.value ?? 0,
        discountType: data.documentDiscount?.type ?? "percentage",
        taxType: data.documentTax?.type ?? null,
        taxId: data.documentTax?.taxId ?? null,
        taxTotal: totals.documentTaxAmount,
        adjustmentLabel: data.adjustmentLabel ?? "Adjustment",
        adjustmentValue: data.adjustmentValue ?? 0,
        total: totals.total,
        notes: data.customerNotes,
        customerNotes: data.customerNotes ?? null,
        termsAndConditions: data.termsAndConditions ?? null,
        pdfTemplateId: data.pdfTemplateId ?? null,
        lineItems: {
          create: data.lines.map((l, i) => ({
            itemId: l.itemId || null,
            description: l.description ?? l.name,
            quantity: l.quantity,
            rate: l.rate,
            taxId: l.taxId ?? null,
            amount: Number(totals.lines[i]?.amount ?? 0),
          })),
        },
      },
    });
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Invoice",
    entityId: id,
    before: { total: before.total.toString() },
    after: { total: totals.total },
  });
  revalidatePath("/sales/invoices");
  revalidatePath(`/sales/invoices/${id}`);
  redirect(`/sales/invoices/${id}`);
}

export async function markInvoiceSentAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.invoice.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date() },
  });
  await enqueueAndAttach(organization.id, id);
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Invoice",
    entityId: id,
    after: { status: "SENT" },
  });
  revalidatePath(`/sales/invoices/${id}`);
}

export async function voidInvoiceAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  await db.invoice.update({
    where: { id },
    data: { status: "VOID", voidedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Invoice",
    entityId: id,
    after: { status: "VOID" },
  });
  revalidatePath(`/sales/invoices/${id}`);
}

export async function writeOffInvoiceAction(
  id: string,
  input: { amount: number; notes?: string | null }
): Promise<void> {
  const { user, organization } = await requireOrganization();
  const inv = await db.invoice.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!inv) throw new Error("Invoice not found");
  await db.invoice.update({
    where: { id },
    data: {
      status: "WRITTEN_OFF",
      writtenOffAt: new Date(),
      writtenOffAmount: input.amount,
    },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Invoice",
    entityId: id,
    after: { status: "WRITTEN_OFF", writtenOffAmount: input.amount, notes: input.notes },
  });
  revalidatePath(`/sales/invoices/${id}`);
}

export async function recordPaymentAction(input: RecordPaymentInput): Promise<void> {
  const { user, organization } = await requireOrganization();
  const data = recordPaymentSchema.parse(input);
  const number = await getNextDocumentNumber(organization.id, "PAYMENT_RECEIVED");

  const totalAllocated = data.allocations.reduce((s, a) => s + Number(a.amount), 0);
  const inExcess = Math.max(0, data.amountReceived - totalAllocated);

  await db.$transaction(async (tx) => {
    const payment = await tx.paymentReceived.create({
      data: {
        organizationId: organization.id,
        number,
        contactId: data.contactId,
        paymentDate: data.paymentDate,
        amount: data.amountReceived,
        amountUsedForInvoices: totalAllocated,
        amountInExcess: inExcess,
        bankCharges: data.bankCharges,
        paymentMode: data.paymentMode,
        method: data.paymentMode,
        depositToAccountId: data.depositToAccountId ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
      },
    });

    for (const a of data.allocations.filter((a) => Number(a.amount) > 0)) {
      const inv = await tx.invoice.findFirst({
        where: {
          id: a.invoiceId,
          organizationId: organization.id,
          deletedAt: null,
        },
      });
      if (!inv) continue;
      await tx.paymentReceivedAllocation.create({
        data: {
          paymentReceivedId: payment.id,
          invoiceId: inv.id,
          amount: a.amount,
        },
      });
      const newPaid = Number(inv.amountPaid) + Number(a.amount);
      const newStatus =
        newPaid >= Number(inv.total)
          ? "PAID"
          : newPaid > 0
          ? "PARTIALLY_PAID"
          : inv.status;
      await tx.invoice.update({
        where: { id: inv.id },
        data: { amountPaid: newPaid, status: newStatus },
      });
    }
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "PaymentReceived",
    entityId: number,
    after: { amount: data.amountReceived, allocations: data.allocations.length },
  });
  revalidatePath("/sales/invoices");
  revalidatePath("/sales/payments-received");
}

export async function sendInvoiceReminderAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  const inv = await db.invoice.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
    include: { contact: true, organization: true },
  });
  if (!inv || !inv.contact.email) throw new Error("Invoice or customer email missing");

  await enqueueEmail({
    organizationId: organization.id,
    toEmail: inv.contact.email,
    subject: `Reminder: Invoice ${inv.number} from ${inv.organization.name}`,
    bodyHtml: `<p>Hello ${inv.contact.displayName},</p><p>This is a friendly reminder that invoice ${inv.number} for ${inv.total} is due on ${format(inv.dueDate, "dd MMM yyyy")}.</p>`,
    documentType: "INVOICE",
    documentId: inv.id,
  });

  await db.invoiceReminder.create({
    data: {
      invoiceId: id,
      type: "MANUAL",
      daysOffset: 0,
      sentAt: new Date(),
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "InvoiceReminder",
    entityId: id,
  });
  revalidatePath(`/sales/invoices/${id}`);
}

export async function deleteInvoiceAction(id: string) {
  const { user, organization } = await requireOrganization();
  const inv = await db.invoice.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!inv) return { ok: false };
  if (inv.status === "PAID" || inv.status === "PARTIALLY_PAID") {
    return { ok: false, error: "Cannot delete invoices with payments" };
  }
  await db.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "Invoice",
    entityId: id,
    before: { number: inv.number },
  });
  revalidatePath("/sales/invoices");
  return { ok: true };
}

async function enqueueAndAttach(orgId: string, invoiceId: string) {
  const inv = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { contact: true, lineItems: true, organization: true },
  });
  if (!inv || !inv.contact.email) return;
  const html = renderSalesDocumentHtml({
    type: "INVOICE",
    organization: { name: inv.organization.name },
    document: {
      number: inv.number,
      date: format(inv.issueDate, "dd MMM yyyy"),
      dueDate: format(inv.dueDate, "dd MMM yyyy"),
      referenceNumber: inv.referenceNumber,
      status: inv.status,
    },
    customer: { displayName: inv.contact.displayName, email: inv.contact.email },
    lines: inv.lineItems.map((l) => ({
      name: l.description,
      description: undefined,
      quantity: l.quantity.toString(),
      rate: l.rate.toString(),
      amount: l.amount.toString(),
    })),
    totals: {
      lines: inv.lineItems.map((l) => ({
        amount: l.amount.toString(),
        taxAmount: "0",
        amountWithTax: l.amount.toString(),
      })),
      subTotal: inv.subtotal.toString(),
      documentDiscountAmount: inv.discountValue.toString(),
      documentTaxAmount: inv.taxTotal.toString(),
      adjustmentAmount: inv.adjustmentValue.toString(),
      total: inv.total.toString(),
    },
    notes: inv.customerNotes,
    termsAndConditions: inv.termsAndConditions,
  });
  await enqueueEmail({
    organizationId: orgId,
    toEmail: inv.contact.email,
    subject: `Invoice ${inv.number} from ${inv.organization.name}`,
    bodyHtml: `<p>Hello ${inv.contact.displayName},</p><p>Your invoice ${inv.number} is attached. Amount due: ${inv.total} by ${format(inv.dueDate, "dd MMM yyyy")}.</p>${html}`,
    documentType: "INVOICE",
    documentId: inv.id,
  });
}
