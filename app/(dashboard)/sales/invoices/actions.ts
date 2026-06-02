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
import {
  applyInvoiceStockDecrement,
  reverseInvoiceStockDecrement,
} from "@/lib/inventory/stock-mutations";
import {
  loadBillableSourcesForCustomer,
  markBillableSourcesUsed,
  type BillableSource,
} from "@/lib/sales/billable-expenses";
import {
  invoiceSchema,
  recordPaymentSchema,
  type InvoiceInput,
  type RecordPaymentInput,
} from "@/lib/validations/invoice";
import {
  postInvoiceSentJe,
  postInvoicePaymentJe,
  postInvoiceWriteOffJe,
  reverseInvoiceSentJe,
  reverseAllInvoiceJes,
  resolveBankCoaForPayment,
} from "@/lib/accounting/post-domain-je";
import { format } from "date-fns";

/**
 * P9-A: client-callable wrapper around the billable-expenses loader.
 * The Invoice form's <BillableExpensesPanel> calls this whenever the
 * selected customer changes.
 */
export async function getBillableExpensesForCustomerAction(input: {
  customerId: string;
}): Promise<BillableSource[]> {
  const { organization } = await requireOrganization();
  if (!input.customerId) return [];
  return loadBillableSourcesForCustomer(organization.id, input.customerId);
}

export async function createInvoiceAction(
  input: InvoiceInput,
  opts?: { send?: boolean }
) {
  const { user, organization } = await requireOrganization();
  const data = invoiceSchema.parse(input);
  const number = await getNextDocumentNumber(organization.id, "INVOICE");
  const totals = await computeDocumentTotals(organization.id, data);

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

  // Stock decrement for tracked items. Outside the create call but
  // safe — both run server-side; on rare failure here the invoice
  // would still exist without stock movement, which is preferable to
  // double-decrementing on retry.
  await applyInvoiceStockDecrement(
    db,
    organization.id,
    { number: created.number, date: created.issueDate },
    data.lines.map((l) => ({
      itemId: l.itemId,
      quantity: l.quantity,
      description: l.description ?? l.name,
    }))
  );

  // P9-A: mark BillLineItem.billableUsedAt + Expense.isBilled for
  // any billable sources the user pulled onto this invoice. Fetches
  // the newly-created invoice line ids in stable order (by id —
  // matches the nested-create insertion order) so the audit row
  // points at the right line. Idempotent + bounded by the
  // BillableExpenseUsage (sourceType, sourceId) unique index.
  if (data.billableSources && data.billableSources.length > 0) {
    const createdLines = await db.invoiceLineItem.findMany({
      where: { invoiceId: created.id },
      orderBy: { id: "asc" },
      select: { id: true },
    });
    await markBillableSourcesUsed(db, {
      organizationId: organization.id,
      customerId: data.contactId,
      invoiceId: created.id,
      invoiceLineItemIds: createdLines.map((l) => l.id),
      sources: data.billableSources,
    });
  }

  // M17c: persist custom field values, if any
  if (data.customFieldValues && data.customFieldValues.length > 0) {
    await db.customFieldValue.createMany({
      data: data.customFieldValues.map((v) => ({
        organizationId: organization.id,
        entityType: "INVOICE",
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
  const totals = await computeDocumentTotals(organization.id, data);

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
    // M17c: replace custom-field values for this invoice wholesale
    await tx.customFieldValue.deleteMany({
      where: {
        organizationId: organization.id,
        entityType: "INVOICE",
        entityId: id,
      },
    });
    if (data.customFieldValues && data.customFieldValues.length > 0) {
      await tx.customFieldValue.createMany({
        data: data.customFieldValues.map((v) => ({
          organizationId: organization.id,
          entityType: "INVOICE",
          entityId: id,
          fieldDefinitionId: v.fieldDefinitionId,
          value: v.value as object,
        })),
        skipDuplicates: true,
      });
    }
    // Stock: reverse the original decrement, then re-apply with the
    // edited line set. Editing is only allowed on DRAFT invoices, so
    // it's safe to fully re-do — there's no partial fulfillment to
    // worry about yet.
    await reverseInvoiceStockDecrement(tx, organization.id, {
      number: before.number,
      date: before.issueDate,
    });
    await applyInvoiceStockDecrement(
      tx,
      organization.id,
      { number: before.number, date: data.invoiceDate },
      data.lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        description: l.description ?? l.name,
      }))
    );
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
  // RPT-B — flip status + post the AR/Revenue JE in one transaction
  // so a JE failure rolls the status change back.
  await db.$transaction(async (tx) => {
    const inv = await tx.invoice.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date() },
      select: { id: true, number: true, issueDate: true, total: true, organizationId: true },
    });
    if (inv.organizationId !== organization.id) {
      throw new Error("Invoice not in this organization");
    }
    await postInvoiceSentJe(tx, organization.id, inv);
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
  const before = await db.invoice.findFirst({
    where: { id, organizationId: organization.id },
    select: { number: true, issueDate: true },
  });
  if (!before) throw new Error("Invoice not found");
  await db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id },
      data: { status: "VOID", voidedAt: new Date() },
    });
    // Voided = goods returned. Restore stock.
    await reverseInvoiceStockDecrement(tx, organization.id, {
      number: before.number,
      date: before.issueDate,
    });
    // RPT-B — pull the invoice-posting JE. Payment JEs intentionally
    // stay (the money really moved); they become a customer-credit
    // imbalance on Trial Balance which is the desired audit signal.
    await reverseInvoiceSentJe(tx, organization.id, id);
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
  // RPT-B.2 — flip status + post DR Bad Debt Expense / CR AR for the
  // write-off amount, atomically.
  await db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id },
      data: {
        status: "WRITTEN_OFF",
        writtenOffAt: new Date(),
        writtenOffAmount: input.amount,
      },
    });
    await postInvoiceWriteOffJe(
      tx,
      organization.id,
      { id: inv.id, number: inv.number, issueDate: inv.issueDate },
      input.amount
    );
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

  // Compose any TDS / excess notes into the payment.notes field. Once we
  // add dedicated columns we'll store them structurally; for v1 a notes
  // prefix keeps the data captured + visible without a migration.
  const noteParts: string[] = [];
  if (data.tdsAmount > 0 || data.tdsRate > 0) {
    noteParts.push(`TDS: ${data.tdsRate}% / ${Number(data.tdsAmount).toFixed(2)}`);
  }
  if (!data.useExcessAsCredit && inExcess > 0) {
    noteParts.push(`Excess (${inExcess.toFixed(2)}) marked for refund.`);
  }
  if (data.notes) noteParts.push(data.notes);
  const composedNotes = noteParts.length > 0 ? noteParts.join("\n") : null;

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
        notes: composedNotes,
      },
    });

    // RPT-B — resolve the bank-side CoA once so per-allocation JE posts
    // can use it. Throws (rolls back) if no posting account can be
    // determined from the user input.
    const bankCoaId = await resolveBankCoaForPayment(tx, organization.id, {
      depositToAccountId: payment.depositToAccountId,
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
      // RPT-B — DR Bank / CR AR per allocation
      await postInvoicePaymentJe(
        tx,
        organization.id,
        payment.id,
        inv.id,
        inv.number,
        Number(a.amount),
        data.paymentDate,
        bankCoaId
      );
    }
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "PaymentReceived",
    entityId: number,
    after: {
      amount: data.amountReceived,
      allocations: data.allocations.length,
      tdsRate: data.tdsRate || undefined,
      tdsAmount: data.tdsAmount || undefined,
    },
  });

  // Customer email confirmation (Email Notification checkbox per spec)
  if (data.emailNotification) {
    const contact = await db.contact.findFirst({
      where: {
        id: data.contactId,
        organizationId: organization.id,
        deletedAt: null,
      },
      select: { displayName: true, email: true },
    });
    if (contact?.email) {
      await enqueueEmail({
        organizationId: organization.id,
        toEmail: contact.email,
        subject: `Payment receipt ${number} from ${organization.name}`,
        bodyHtml: `<p>Hello ${contact.displayName},</p>
<p>We have received your payment of <strong>${Number(data.amountReceived).toFixed(2)}</strong> on
${data.paymentDate.toLocaleDateString()} via ${data.paymentMode}. Thank you.</p>`,
        documentType: "PAYMENT_RECEIVED",
        documentId: number,
      });
    }
  }

  revalidatePath("/sales/invoices");
  revalidatePath("/sales/payments-received");
}

/**
 * Send Reminder modal action — accepts the merchant-editable subject/body
 * (with merge tags) and an optional scheduledFor for "Send Later". Records
 * an InvoiceReminder row per the <invoices_spec> Send Reminder modal.
 */
export async function sendInvoiceReminderAction(input: {
  invoiceId: string;
  subject: string;
  bodyHtml: string;
  scheduledFor?: Date | string | null;
}): Promise<void> {
  const { user, organization } = await requireOrganization();
  const inv = await db.invoice.findFirst({
    where: { id: input.invoiceId, organizationId: organization.id, deletedAt: null },
    include: { contact: true, organization: true },
  });
  if (!inv || !inv.contact.email) throw new Error("Invoice or customer email missing");
  if (!input.subject?.trim()) throw new Error("Subject is required");
  if (!input.bodyHtml?.trim()) throw new Error("Body is required");

  // Merge-tag substitution happens in the modal preview but we re-run it
  // server-side too in case anyone hits the action directly.
  const ctx = {
    customerName: inv.contact.displayName,
    customerEmail: inv.contact.email,
    documentNumber: inv.number,
    documentTotal: inv.total.toString(),
    documentDate: format(inv.issueDate, "dd MMM yyyy"),
    documentDueDate: format(inv.dueDate, "dd MMM yyyy"),
    orgName: inv.organization.name,
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
    toEmail: inv.contact.email,
    subject: renderedSubject,
    bodyHtml: renderedBody,
    documentType: "INVOICE",
    documentId: inv.id,
    scheduledFor,
  });

  await db.invoiceReminder.create({
    data: {
      invoiceId: input.invoiceId,
      type: "MANUAL",
      daysOffset: 0,
      sentAt: scheduledFor.getTime() <= Date.now() ? scheduledFor : null,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "InvoiceReminder",
    entityId: input.invoiceId,
    after: { subject: renderedSubject, scheduledFor: scheduledFor.toISOString() },
  });
  revalidatePath(`/sales/invoices/${input.invoiceId}`);
}

/**
 * Apply one or more credit notes to this invoice. Mirrors the Credit Note →
 * Invoice direction (which is what the Credit Note detail's Apply dialog
 * uses) but reverses the entry point — the Invoice detail also gets an
 * "Apply Credits" action per <invoices_spec>.
 */
export async function applyCreditsToInvoiceAction(
  invoiceId: string,
  applications: { creditNoteId: string; amount: number }[]
): Promise<void> {
  const { user, organization } = await requireOrganization();
  if (!applications || applications.length === 0) {
    throw new Error("Pick at least one credit note");
  }
  const inv = await db.invoice.findFirst({
    where: { id: invoiceId, organizationId: organization.id, deletedAt: null },
  });
  if (!inv) throw new Error("Invoice not found");
  const totalToApply = applications.reduce((s, a) => s + Number(a.amount), 0);
  const balance = Number(inv.total) - Number(inv.amountPaid);
  if (totalToApply > balance + 0.0001) {
    throw new Error("Total applied exceeds invoice balance");
  }

  await db.$transaction(async (tx) => {
    for (const a of applications.filter((a) => Number(a.amount) > 0)) {
      const cn = await tx.creditNote.findFirst({
        where: {
          id: a.creditNoteId,
          organizationId: organization.id,
          deletedAt: null,
        },
      });
      if (!cn) continue;
      const cnBalance =
        Number(cn.total) - Number(cn.amountApplied) - Number(cn.amountRefunded);
      if (Number(a.amount) > cnBalance + 0.0001) {
        throw new Error(`Credit note ${cn.number} balance exceeded`);
      }
      await tx.creditNoteApplication.create({
        data: {
          creditNoteId: cn.id,
          invoiceId,
          amountApplied: a.amount,
        },
      });
      const newCnApplied = Number(cn.amountApplied) + Number(a.amount);
      const newCnBalance =
        Number(cn.total) - newCnApplied - Number(cn.amountRefunded);
      await tx.creditNote.update({
        where: { id: cn.id },
        data: {
          amountApplied: newCnApplied,
          status: newCnBalance <= 0.0001 ? "CLOSED" : cn.status,
        },
      });
    }
    const newPaid = Number(inv.amountPaid) + totalToApply;
    const newStatus =
      newPaid >= Number(inv.total) - 0.0001
        ? "PAID"
        : newPaid > 0
        ? "PARTIALLY_PAID"
        : inv.status;
    await tx.invoice.update({
      where: { id: invoiceId },
      data: { amountPaid: newPaid, status: newStatus },
    });
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Invoice",
    entityId: invoiceId,
    after: {
      creditApplied: totalToApply,
      applications: applications.length,
    },
  });
  revalidatePath(`/sales/invoices/${invoiceId}`);
  revalidatePath("/sales/credit-notes");
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
  await db.$transaction(async (tx) => {
    await tx.invoice.update({ where: { id }, data: { deletedAt: new Date() } });
    // Soft-delete = pretend it never happened. Restore stock.
    await reverseInvoiceStockDecrement(tx, organization.id, {
      number: inv.number,
      date: inv.issueDate,
    });
    // RPT-B — delete every JE tied to this invoice (the SENT post plus
    // any payment allocations). Soft-delete with payments is blocked
    // above, so this is safe — only DRAFT/SENT/VOID get here.
    await reverseAllInvoiceJes(tx, organization.id, id);
  });
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

/**
 * INVOICE EMAIL — Manual "Send via Email" action.
 *
 * Sends the invoice to the customer's email with:
 *   - User-supplied subject + body (merge tags substituted server-side
 *     as a defense-in-depth — the modal also substitutes for the
 *     live preview)
 *   - The fully-rendered invoice HTML appended to the body
 *   - Existing email-queue + Resend pipeline handles delivery + retries
 *
 * Updates `sentAt` on first send. Records an audit log entry. Does
 * NOT transition status (caller is expected to mark SENT separately
 * if invoice is still DRAFT — though the UI button is gated to
 * non-DRAFT invoices anyway).
 */
export async function sendInvoiceAction(input: {
  invoiceId: string;
  subject: string;
  bodyHtml: string;
  scheduledFor?: Date | string | null;
}): Promise<void> {
  const { user, organization } = await requireOrganization();
  const inv = await db.invoice.findFirst({
    where: {
      id: input.invoiceId,
      organizationId: organization.id,
      deletedAt: null,
    },
    include: { contact: true, organization: true, lineItems: true },
  });
  if (!inv || !inv.contact.email) {
    throw new Error("Invoice or customer email missing");
  }
  if (!input.subject?.trim()) throw new Error("Subject is required");
  if (!input.bodyHtml?.trim()) throw new Error("Body is required");

  const ctx = {
    customerName: inv.contact.displayName,
    customerEmail: inv.contact.email,
    documentNumber: inv.number,
    documentTotal: inv.total.toString(),
    documentDate: format(inv.issueDate, "dd MMM yyyy"),
    documentDueDate: format(inv.dueDate, "dd MMM yyyy"),
    orgName: inv.organization.name,
  };
  const renderedSubject = applyMergeTags(input.subject, ctx);
  const renderedBody = applyMergeTags(input.bodyHtml, ctx);

  // Append the rendered invoice HTML so the customer can read the
  // invoice inline without opening the attachment. Mirrors what
  // `enqueueAndAttach` does for the auto-send-on-mark-SENT path.
  const customFields = await loadVisibleCustomFields({
    organizationId: organization.id,
    entityType: "INVOICE",
    entityId: inv.id,
    surface: "pdf",
  });
  const invoiceHtml = renderSalesDocumentHtml({
    type: "INVOICE",
    organization: { name: inv.organization.name },
    document: {
      number: inv.number,
      date: format(inv.issueDate, "dd MMM yyyy"),
      dueDate: format(inv.dueDate, "dd MMM yyyy"),
      referenceNumber: inv.referenceNumber,
      status: inv.status,
    },
    customer: {
      displayName: inv.contact.displayName,
      email: inv.contact.email,
    },
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
    customFields,
  });
  const combinedBody = `${renderedBody}<hr style="margin: 24px 0; border: 0; border-top: 1px solid #ddd;"/>${invoiceHtml}`;

  const scheduledFor =
    input.scheduledFor instanceof Date
      ? input.scheduledFor
      : input.scheduledFor
        ? new Date(input.scheduledFor)
        : new Date();

  await enqueueEmail({
    organizationId: organization.id,
    toEmail: inv.contact.email,
    subject: renderedSubject,
    bodyHtml: combinedBody,
    documentType: "INVOICE",
    documentId: inv.id,
    scheduledFor,
  });

  // Stamp sentAt on first send so the UI shows "Sent on …" indicator.
  if (!inv.sentAt) {
    await db.invoice.update({
      where: { id: inv.id },
      data: { sentAt: new Date() },
    });
  }

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Invoice",
    entityId: input.invoiceId,
    after: {
      sentViaEmail: true,
      subject: renderedSubject,
      scheduledFor: scheduledFor.toISOString(),
    },
  });
  revalidatePath(`/sales/invoices/${input.invoiceId}`);
}

async function enqueueAndAttach(orgId: string, invoiceId: string) {
  const inv = await db.invoice.findUnique({
    where: { id: invoiceId },
    include: { contact: true, lineItems: true, organization: true },
  });
  if (!inv || !inv.contact.email) return;
  // M22: include showOnPdf custom fields in the email-attached HTML body
  const customFields = await loadVisibleCustomFields({
    organizationId: orgId,
    entityType: "INVOICE",
    entityId: inv.id,
    surface: "pdf",
  });
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
    customFields,
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

/**
 * Bulk actions per <invoices_spec> "Bulk actions: Mark as Sent, Send
 * Reminder, Print, Email, Delete". Print/Email deferred.
 *
 * Bulk Mark Sent: only DRAFT rows transition to SENT.
 * Bulk Send Reminder: enqueues a payment-reminder email per overdue/sent
 *   invoice that has a customer email on file.
 * Bulk Delete: blocked when any selected invoice has amountPaid > 0.
 */
export async function bulkMarkInvoicesSentAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.invoice.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      status: "DRAFT",
    },
    data: { status: "SENT" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Invoice",
    entityId: `bulk-${Date.now()}`,
    after: { status: "SENT", count: result.count, ids: input.ids },
  });
  revalidatePath("/sales/invoices");
  return { ok: true, updated: result.count };
}

export async function bulkSendRemindersAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const targets = await db.invoice.findMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] },
    },
    include: { contact: true, organization: true },
  });
  let queued = 0;
  for (const inv of targets) {
    if (!inv.contact.email) continue;
    const balance = Number(inv.total) - Number(inv.amountPaid);
    await enqueueEmail({
      organizationId: organization.id,
      toEmail: inv.contact.email,
      subject: `Payment reminder — Invoice ${inv.number}`,
      bodyHtml: `<p>Hello ${inv.contact.displayName},</p>
<p>This is a friendly reminder that invoice <strong>${inv.number}</strong> for ${balance} is due on ${format(inv.dueDate, "dd MMM yyyy")}.</p>
<p>Thank you,<br/>${inv.organization.name}</p>`,
      documentType: "INVOICE_REMINDER",
      documentId: inv.id,
    });
    queued += 1;
  }
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "InvoiceReminderBulk",
    entityId: `bulk-${Date.now()}`,
    after: { queued, ids: input.ids },
  });
  revalidatePath("/sales/invoices");
  return { ok: true, updated: queued };
}

export async function bulkDeleteInvoicesAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  // Block delete when any selected invoice has payments applied
  const blocked = await db.invoice.count({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      amountPaid: { gt: 0 },
    },
  });
  if (blocked > 0) {
    return {
      ok: false,
      error: `${blocked} invoice${blocked === 1 ? "" : "s"} with payments applied cannot be deleted`,
    };
  }
  const result = await db.invoice.updateMany({
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
    entityType: "Invoice",
    entityId: `bulk-${Date.now()}`,
    before: { count: result.count, ids: input.ids },
  });
  revalidatePath("/sales/invoices");
  return { ok: true, updated: result.count };
}

/**
 * Bulk email per <invoices_spec> "Bulk: Email". Skips invoices whose
 * customer has no email on file.
 */
export async function bulkEmailInvoicesAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const targets = await db.invoice.findMany({
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
    entityType: "InvoiceEmailBulk",
    entityId: `bulk-${Date.now()}`,
    after: { queued, ids: input.ids },
  });
  revalidatePath("/sales/invoices");
  return { ok: true, updated: queued };
}
