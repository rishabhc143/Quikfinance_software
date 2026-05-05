import { z } from "zod";
import { lineItemSchema } from "./quote";

export const creditNoteSchema = z.object({
  contactId: z.string().min(1, "Customer required"),
  referenceNumber: z.string().max(80).nullable().optional(),
  creditNoteDate: z.coerce.date(),
  reason: z.string().max(500).nullable().optional(),
  currency: z.string().min(3).max(8).default("INR"),
  customerNotes: z.string().max(2000).nullable().optional(),
  termsAndConditions: z.string().max(4000).nullable().optional(),
  pdfTemplateId: z.string().nullable().optional(),
  lines: z.array(lineItemSchema).min(1),
});
export type CreditNoteInput = z.input<typeof creditNoteSchema>;

export const applyCreditSchema = z.object({
  invoiceId: z.string().min(1),
  amountApplied: z.coerce.number().positive(),
});
export type ApplyCreditInput = z.input<typeof applyCreditSchema>;

export const refundCreditSchema = z.object({
  refundDate: z.coerce.date(),
  amount: z.coerce.number().positive(),
  mode: z.enum(["cash", "bank_transfer", "cheque", "credit_card", "upi", "other"]),
  reference: z.string().max(80).nullable().optional(),
  fromAccountId: z.string().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type RefundCreditInput = z.input<typeof refundCreditSchema>;
