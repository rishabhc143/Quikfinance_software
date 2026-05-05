import { z } from "zod";
import { lineItemSchema } from "./quote";

export const recurringInvoiceSchema = z.object({
  profileName: z.string().min(1, "Profile name required").max(120),
  contactId: z.string().min(1, "Customer required"),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "EVERY_N_MONTHS", "YEARLY"]),
  intervalN: z.coerce.number().int().min(1).default(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable().optional(),
  neverExpires: z.boolean().default(false),
  paymentTermsId: z.string().nullable().optional(),
  salespersonId: z.string().nullable().optional(),
  emailAutomatically: z.boolean().default(true),
  currency: z.string().min(3).max(8).default("INR"),
  documentDiscount: z
    .object({
      value: z.coerce.number().nonnegative().default(0),
      type: z.enum(["percentage", "amount"]).default("percentage"),
    })
    .optional(),
  adjustmentValue: z.coerce.number().default(0),
  adjustmentLabel: z.string().max(40).nullable().optional(),
  customerNotes: z.string().max(2000).nullable().optional(),
  termsAndConditions: z.string().max(4000).nullable().optional(),
  lines: z.array(lineItemSchema).min(1),
});
export type RecurringInvoiceInput = z.input<typeof recurringInvoiceSchema>;
