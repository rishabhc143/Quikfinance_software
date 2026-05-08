import { z } from "zod";
import { lineItemSchema } from "./quote";

/**
 * M23: Debit Note validation. The DebitNote model was scaffolded in
 * M17a; this schema is what create/update server actions parse.
 *
 * Debit Notes are seller-issued documents that increase a customer's
 * receivable (e.g. late fee, escalation charge). Distinct from
 * CreditNote which decreases.
 */
export const debitNoteSchema = z.object({
  contactId: z.string().min(1, "Customer required"),
  referenceNumber: z.string().max(80).nullable().optional(),
  debitNoteDate: z.coerce.date(),
  reason: z.string().max(500).nullable().optional(),
  currency: z.string().min(3).max(8).default("INR"),
  customerNotes: z.string().max(2000).nullable().optional(),
  termsAndConditions: z.string().max(4000).nullable().optional(),
  pdfTemplateId: z.string().nullable().optional(),
  // M25: optional custom field values keyed by CustomFieldDefinition.id
  customFieldValues: z
    .array(
      z.object({
        fieldDefinitionId: z.string().min(1),
        value: z.unknown(),
      })
    )
    .optional()
    .default([]),
  lines: z.array(lineItemSchema).min(1),
});
export type DebitNoteInput = z.input<typeof debitNoteSchema>;
