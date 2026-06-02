import { z } from "zod";
import { lineItemSchema } from "./quote";
import { attachmentsField, customFieldValuesField } from "./shared-fields";

export const deliveryChallanSchema = z.object({
  contactId: z.string().min(1, "Customer required"),
  referenceNumber: z.string().max(80).nullable().optional(),
  challanDate: z.coerce.date(),
  challanType: z
    .enum(["job_work", "supply_on_approval", "supply_for_liquid_gas", "others"])
    .default("others"),
  customerNotes: z.string().max(2000).nullable().optional(),
  termsAndConditions: z.string().max(4000).nullable().optional(),
  pdfTemplateId: z.string().nullable().optional(),
  attachments: attachmentsField(10),
  // M25: optional custom field values keyed by CustomFieldDefinition.id
  customFieldValues: customFieldValuesField,
  lines: z.array(lineItemSchema).min(1, "At least one line item required"),
});
export type DeliveryChallanInput = z.input<typeof deliveryChallanSchema>;
