import { db } from "@/lib/db";
import { getNextDocumentNumber } from "@/lib/sales/numbering";
import { enqueueEmail } from "@/lib/sales/email-sender";
import { renderSalesDocumentHtml } from "@/lib/sales/pdf-renderer";
import { format } from "date-fns";

/**
 * Compute the next occurrence date for a recurring invoice. Pure helper —
 * separated so the cron generator and the form can share the calculation.
 */
export function computeNextOccurrence(
  current: Date,
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "EVERY_N_MONTHS" | "YEARLY",
  intervalN: number
): Date {
  const next = new Date(current);
  switch (frequency) {
    case "DAILY":
      next.setDate(next.getDate() + 1);
      break;
    case "WEEKLY":
      next.setDate(next.getDate() + 7);
      break;
    case "MONTHLY":
      next.setMonth(next.getMonth() + 1);
      break;
    case "EVERY_N_MONTHS":
      next.setMonth(next.getMonth() + Math.max(1, intervalN));
      break;
    case "YEARLY":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  return next;
}

type RecurringTemplateLine = {
  itemId: string | null;
  position: number;
  name: string;
  description: string | null;
  hsnSacCode: string | null;
  quantity: number;
  unit: string | null;
  rate: number;
  discount: number;
  discountType: string;
  taxId: string | null;
  taxAmount: number;
  amount: number;
};

type RecurringTemplate = {
  orderNumber?: string | null;
  paymentTermsId: string | null;
  salespersonId: string | null;
  currency: string;
  subTotal: number;
  discountValue: number;
  discountType: string;
  taxAmount: number;
  adjustmentLabel: string;
  adjustmentValue: number;
  total: number;
  customerNotes: string | null;
  termsAndConditions: string | null;
  lines: RecurringTemplateLine[];
};

function isRecurringTemplate(value: unknown): value is RecurringTemplate {
  return Boolean(value && typeof value === "object" && Array.isArray((value as RecurringTemplate).lines));
}

/**
 * Generate one occurrence for a given recurring invoice. Idempotent on
 * (recurringInvoiceId × occurrenceDate). Returns the created invoice or
 * null if already generated for that date.
 */
export async function generateRecurringOccurrence(
  recurringId: string,
  occurrenceDate: Date
): Promise<{ invoiceId: string | null; reason?: string }> {
  const r = await db.recurringInvoice.findUnique({
    where: { id: recurringId },
    include: { contact: true, organization: true },
  });
  if (!r) return { invoiceId: null, reason: "not-found" };
  if (r.status !== "ACTIVE") return { invoiceId: null, reason: `status=${r.status}` };

  const existing = await db.recurringInvoiceOccurrence.findUnique({
    where: {
      recurringInvoiceId_occurrenceDate: {
        recurringInvoiceId: recurringId,
        occurrenceDate,
      },
    },
  });
  if (existing) return { invoiceId: existing.invoiceId, reason: "duplicate" };

  const template = r.templateJson;
  if (!isRecurringTemplate(template)) {
    await db.recurringInvoiceOccurrence.create({
      data: {
        recurringInvoiceId: recurringId,
        occurrenceDate,
        status: "FAILED",
        errorMessage: "templateJson missing or invalid",
      },
    });
    return { invoiceId: null, reason: "no-template" };
  }
  const tpl: RecurringTemplate = template;

  const invoiceNumber = await getNextDocumentNumber(r.organizationId, "INVOICE");
  const today = occurrenceDate;
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + 30);

  const inv = await db.$transaction(async (tx) => {
    const created = await tx.invoice.create({
      data: {
        organizationId: r.organizationId,
        number: invoiceNumber,
        referenceNumber: tpl.orderNumber ?? null,
        contactId: r.contactId,
        status: r.emailAutomatically ? "SENT" : "DRAFT",
        issueDate: today,
        dueDate,
        paymentTermsId: tpl.paymentTermsId,
        salespersonId: tpl.salespersonId,
        currency: tpl.currency,
        subtotal: tpl.subTotal,
        discountValue: tpl.discountValue,
        discountType: tpl.discountType,
        taxTotal: tpl.taxAmount,
        adjustmentLabel: tpl.adjustmentLabel,
        adjustmentValue: tpl.adjustmentValue,
        total: tpl.total,
        customerNotes: tpl.customerNotes,
        termsAndConditions: tpl.termsAndConditions,
        recurringInvoiceId: r.id,
        sentAt: r.emailAutomatically ? today : null,
        lineItems: {
          create: tpl.lines.map((l) => ({
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

    await tx.recurringInvoiceOccurrence.create({
      data: {
        recurringInvoiceId: r.id,
        occurrenceDate,
        invoiceId: created.id,
        status: "GENERATED",
      },
    });

    const next = computeNextOccurrence(occurrenceDate, r.frequency as "DAILY" | "WEEKLY" | "MONTHLY" | "EVERY_N_MONTHS" | "YEARLY", r.intervalN);
    const expired =
      !r.neverExpires && r.endDate ? next > r.endDate : false;
    await tx.recurringInvoice.update({
      where: { id: r.id },
      data: {
        nextOccurrenceDate: next,
        nextRunAt: next,
        occurrencesGenerated: { increment: 1 },
        status: expired ? "EXPIRED" : r.status,
      },
    });
    return created;
  });

  if (r.emailAutomatically && r.contact.email) {
    const html = renderSalesDocumentHtml({
      type: "INVOICE",
      organization: { name: r.organization.name },
      document: {
        number: invoiceNumber,
        date: format(today, "dd MMM yyyy"),
        dueDate: format(dueDate, "dd MMM yyyy"),
        status: "SENT",
      },
      customer: { displayName: r.contact.displayName, email: r.contact.email },
      lines: tpl.lines.map((l) => ({
        name: l.name,
        description: l.description,
        quantity: l.quantity.toString(),
        rate: l.rate.toString(),
        amount: l.amount.toString(),
      })),
      totals: {
        lines: tpl.lines.map((l) => ({
          amount: l.amount.toString(),
          taxAmount: l.taxAmount.toString(),
          amountWithTax: l.amount.toString(),
        })),
        subTotal: tpl.subTotal.toString(),
        documentDiscountAmount: tpl.discountValue.toString(),
        documentTaxAmount: tpl.taxAmount.toString(),
        adjustmentAmount: tpl.adjustmentValue.toString(),
        total: tpl.total.toString(),
      },
      notes: tpl.customerNotes,
      termsAndConditions: tpl.termsAndConditions,
    });
    await enqueueEmail({
      organizationId: r.organizationId,
      toEmail: r.contact.email,
      subject: `Invoice ${invoiceNumber} from ${r.organization.name}`,
      bodyHtml: `<p>Hello ${r.contact.displayName},</p><p>Your recurring invoice ${invoiceNumber} is attached.</p>${html}`,
      documentType: "INVOICE",
      documentId: inv.id,
    });
  }

  return { invoiceId: inv.id };
}
