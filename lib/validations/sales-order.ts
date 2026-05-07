import { z } from "zod";
import { lineItemSchema } from "./quote";

export const salesOrderSchema = z.object({
  contactId: z.string().min(1, "Customer required"),
  referenceNumber: z.string().max(80).nullable().optional(),
  orderDate: z.coerce.date(),
  expectedShipmentDate: z.coerce.date().nullable().optional(),
  paymentTermsId: z.string().nullable().optional(),
  deliveryMethodId: z.string().nullable().optional(),
  salespersonId: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "CONFIRMED", "CLOSED", "VOID"]).default("DRAFT"),
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
  // M21: optional custom field values keyed by CustomFieldDefinition.id.
  customFieldValues: z
    .array(
      z.object({
        fieldDefinitionId: z.string().min(1),
        value: z.unknown(),
      })
    )
    .optional()
    .default([]),
  lines: z.array(lineItemSchema).min(1, "At least one line item required"),
});
export type SalesOrderInput = z.input<typeof salesOrderSchema>;
