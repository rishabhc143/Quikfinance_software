import { z } from "zod";

/**
 * Purchases module — Bill zod schemas.
 *
 * Differences from the Purchase Order shape:
 *   - `number` is REQUIRED at create time (per master prompt: bill
 *     numbers are MANUAL — the user types the vendor's source-doc
 *     number, no NumberSeries row for BILL).
 *   - Uniqueness is enforced per `(orgId, contactId, number)` — same
 *     vendor can't have two bills with the same number; different
 *     vendors can.
 *   - `billableToCustomerId` per line — when set, the line is owed
 *     back from a specific customer and will surface on their next
 *     Invoice via <BillableExpensesPanel>.
 *   - `documentTax` accepts both TDS and TCS like PO (TDS deducts,
 *     TCS adds at source).
 *   - No `deliveryAddressMode` (irrelevant — the bill is just an
 *     A/P record, not a logistics doc).
 *   - Status enum includes `WRITTEN_OFF` (PR #81 added it).
 */

export const billLineSchema = z.object({
  itemId: z.string().nullable().optional(),
  position: z.coerce.number().int().nonnegative().default(0),
  name: z.string().min(1, "Item name required").max(500),
  description: z.string().max(2000).nullable().optional(),
  hsnSacCode: z.string().max(20).nullable().optional(),
  /** Inline ACCOUNT column on BillLineItem (PR #81). */
  accountId: z.string().nullable().optional(),
  /** Billable-expense tracking — pull onto a customer's next Invoice. */
  billableToCustomerId: z.string().nullable().optional(),
  quantity: z.coerce.number().nonnegative().default(1),
  rate: z.coerce.number().nonnegative().default(0),
  taxId: z.string().nullable().optional(),
  discount: z.coerce.number().nonnegative().default(0),
  discountType: z.enum(["percentage", "amount"]).default("percentage"),
  itcEligible: z.boolean().default(true),
});
export type BillLineInput = z.input<typeof billLineSchema>;

export const BILL_STATUSES = [
  "DRAFT",
  "OPEN",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "VOID",
  "WRITTEN_OFF",
] as const;
export type BillStatusValue = (typeof BILL_STATUSES)[number];

export const billSchema = z.object({
  contactId: z.string().min(1, "Vendor required"),
  /** Manual bill number. Required when creating; uniqueness enforced
   *  per (org × vendor) at the action layer. */
  number: z.string().min(1, "Bill # is required").max(80),
  referenceNumber: z.string().max(80).nullable().optional(),
  subject: z.string().max(500).nullable().optional(),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  paymentTermsId: z.string().nullable().optional(),
  placeOfSupply: z.string().nullable().optional(),
  /** When the Bill was created from a Convert PO → Bill flow. */
  purchaseOrderId: z.string().nullable().optional(),
  accountsPayableId: z.string().nullable().optional(),
  status: z.enum(BILL_STATUSES).default("DRAFT"),
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
  lines: z.array(billLineSchema).min(1, "At least one line item required"),
});

export type BillInput = z.input<typeof billSchema>;
export type BillParsed = z.output<typeof billSchema>;
