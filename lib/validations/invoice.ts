import { z } from "zod";
import { lineItemSchema } from "./quote";

export const invoiceSchema = z.object({
  contactId: z.string().min(1, "Customer required"),
  referenceNumber: z.string().max(80).nullable().optional(),
  invoiceDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  paymentTermsId: z.string().nullable().optional(),
  salespersonId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  status: z
    .enum([
      "DRAFT",
      "SENT",
      "PARTIALLY_PAID",
      "PAID",
      "OVERDUE",
      "VOID",
      "WRITTEN_OFF",
    ])
    .default("DRAFT"),
  currency: z.string().min(3).max(8).default("INR"),
  documentDiscount: z
    .object({
      value: z.coerce.number().nonnegative().default(0),
      type: z.enum(["percentage", "amount"]).default("percentage"),
    })
    .optional(),
  documentTax: z
    .object({ taxId: z.string(), type: z.enum(["TDS", "TCS"]) })
    .nullable()
    .optional(),
  adjustmentLabel: z.string().max(40).nullable().optional(),
  adjustmentValue: z.coerce.number().default(0),
  customerNotes: z.string().max(2000).nullable().optional(),
  termsAndConditions: z.string().max(4000).nullable().optional(),
  pdfTemplateId: z.string().nullable().optional(),
  lines: z.array(lineItemSchema).min(1, "At least one line item required"),
});
export type InvoiceInput = z.input<typeof invoiceSchema>;

export const recordPaymentSchema = z.object({
  contactId: z.string().min(1),
  paymentDate: z.coerce.date(),
  amountReceived: z.coerce.number().positive("Amount must be positive"),
  paymentMode: z
    .enum(["cash", "bank_transfer", "cheque", "credit_card", "upi", "other"])
    .default("bank_transfer"),
  depositToAccountId: z.string().nullable().optional(),
  bankCharges: z.coerce.number().nonnegative().default(0),
  reference: z.string().max(80).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  allocations: z
    .array(
      z.object({
        invoiceId: z.string(),
        amount: z.coerce.number().nonnegative(),
      })
    )
    .min(0),
});
export type RecordPaymentInput = z.input<typeof recordPaymentSchema>;

export const writeOffSchema = z.object({
  amount: z.coerce.number().positive(),
  notes: z.string().max(500).nullable().optional(),
});
