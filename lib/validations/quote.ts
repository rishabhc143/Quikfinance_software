import { z } from "zod";
import { attachmentsField, customFieldValuesField } from "./shared-fields";

/** Sales module — Quote zod schemas. Shared with Sales Orders / Invoices. */

export const lineItemSchema = z.object({
  itemId: z.string().nullable().optional(),
  position: z.coerce.number().int().nonnegative().default(0),
  name: z.string().min(1, "Item name required").max(500),
  description: z.string().max(2000).nullable().optional(),
  hsnSacCode: z.string().max(20).nullable().optional(),
  quantity: z.coerce.number().nonnegative().default(1),
  unit: z.string().max(20).nullable().optional(),
  rate: z.coerce.number().nonnegative().default(0),
  discount: z.coerce.number().nonnegative().default(0),
  discountType: z.enum(["percentage", "amount"]).default("percentage"),
  taxId: z.string().nullable().optional(),
});
export type LineItemInput = z.input<typeof lineItemSchema>;

export const quoteSchema = z.object({
  contactId: z.string().min(1, "Customer required"),
  referenceNumber: z.string().max(80).nullable().optional(),
  quoteDate: z.coerce.date(),
  expiryDate: z.coerce.date().nullable().optional(),
  salespersonId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  subject: z.string().max(500).nullable().optional(),
  status: z
    .enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "INVOICED"])
    .default("DRAFT"),
  currency: z.string().min(3).max(8).default("INR"),
  documentDiscount: z
    .object({
      value: z.coerce.number().nonnegative().default(0),
      type: z.enum(["percentage", "amount"]).default("percentage"),
    })
    .optional(),
  documentTax: z
    .object({
      taxId: z.string(),
      type: z.enum(["TDS", "TCS"]),
    })
    .nullable()
    .optional(),
  adjustmentLabel: z.string().max(40).nullable().optional(),
  adjustmentValue: z.coerce.number().default(0),
  customerNotes: z.string().max(2000).nullable().optional(),
  termsAndConditions: z.string().max(4000).nullable().optional(),
  pdfTemplateId: z.string().nullable().optional(),
  attachments: attachmentsField(5),
  // M21: optional custom field values keyed by CustomFieldDefinition.id.
  customFieldValues: customFieldValuesField,
  lines: z.array(lineItemSchema).min(1, "At least one line item required"),
});
export type QuoteInput = z.input<typeof quoteSchema>;
