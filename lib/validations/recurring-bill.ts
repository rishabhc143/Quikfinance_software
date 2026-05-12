import { z } from "zod";

/**
 * Purchases — RecurringBill zod schemas per <recurring_bills_spec>.
 *
 * Differences from a one-shot Bill:
 *  - `profileName` (required, identifies the profile in the list)
 *  - `frequency` + `intervalN` + `startDate` + `endDate` or `neverExpires`
 *  - No bill `number` (cron generates a per-cycle number)
 *  - No `dueDate` (computed at generation time from startDate + 30d)
 *  - Lines persist on `RecurringBill.templateJson` since the schema
 *    has no separate RecurringBillLineItem table — the cron unpacks
 *    that JSON into actual BillLineItem rows when it generates a
 *    Bill.
 *  - Status defaults to ACTIVE (not DRAFT) — the profile starts
 *    generating immediately unless paused.
 */

export const recurringBillLineSchema = z.object({
  itemId: z.string().nullable().optional(),
  position: z.coerce.number().int().nonnegative().default(0),
  name: z.string().min(1, "Item name required").max(500),
  description: z.string().max(2000).nullable().optional(),
  hsnSacCode: z.string().max(20).nullable().optional(),
  accountId: z.string().nullable().optional(),
  billableToCustomerId: z.string().nullable().optional(),
  quantity: z.coerce.number().nonnegative().default(1),
  rate: z.coerce.number().nonnegative().default(0),
  taxId: z.string().nullable().optional(),
});
export type RecurringBillLineInput = z.input<typeof recurringBillLineSchema>;

export const RECURRING_BILL_FREQUENCIES = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;
export type RecurringBillFrequency =
  (typeof RECURRING_BILL_FREQUENCIES)[number];

export const RECURRING_BILL_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "EXPIRED",
  "STOPPED",
] as const;

export const recurringBillSchema = z
  .object({
    profileName: z.string().min(1, "Profile name required").max(120),
    contactId: z.string().min(1, "Vendor required"),
    referenceNumber: z.string().max(80).nullable().optional(),
    frequency: z.enum(RECURRING_BILL_FREQUENCIES),
    intervalN: z.coerce.number().int().min(1).default(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullable().optional(),
    neverExpires: z.boolean().default(true),
    paymentTermsId: z.string().nullable().optional(),
    placeOfSupply: z.string().nullable().optional(),
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
    notes: z.string().max(2000).nullable().optional(),
    termsAndConditions: z.string().max(4000).nullable().optional(),
    lines: z
      .array(recurringBillLineSchema)
      .min(1, "At least one line item required"),
    status: z.enum(RECURRING_BILL_STATUSES).default("ACTIVE"),
  })
  .refine(
    (v) => v.neverExpires || (v.endDate !== null && v.endDate !== undefined),
    {
      message:
        "Either set an end date or check 'Never expires'",
      path: ["endDate"],
    }
  );

export type RecurringBillInput = z.input<typeof recurringBillSchema>;
