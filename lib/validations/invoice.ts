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
  attachments: z
    .array(
      z.object({
        fileName: z.string().min(1).max(200),
        fileUrl: z.string().min(1),
        fileSize: z.coerce.number().int().nonnegative(),
        mimeType: z.string().min(1).max(120),
      })
    )
    .max(10)
    .optional()
    .default([]),
  // M17c: optional custom field values keyed by CustomFieldDefinition.id.
  // The save action persists these via setCustomFieldValuesAction inside
  // its transaction.
  customFieldValues: z
    .array(
      z.object({
        fieldDefinitionId: z.string().min(1),
        // Stored as JSON; runtime shape varies by dataType.
        value: z.unknown(),
      })
    )
    .optional()
    .default([]),
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
  /** Tax Deducted at Source (per <payments_received_spec> Tax Deducted
   *  if TDS: rate + amount). Stored on the PaymentReceived row's notes
   *  prefix until a dedicated column lands. */
  tdsRate: z.coerce.number().nonnegative().default(0),
  tdsAmount: z.coerce.number().nonnegative().default(0),
  /** Whether the customer should receive an email confirmation when
   *  this payment is recorded (default off — per spec checkbox). */
  emailNotification: z.boolean().default(false),
  /** Whether excess (amountReceived - sum(allocations)) should be
   *  retained as customer credit (default true) or refunded
   *  immediately. v1 always retains; the toggle is recorded for
   *  future "auto-refund excess" wiring. */
  useExcessAsCredit: z.boolean().default(true),
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
