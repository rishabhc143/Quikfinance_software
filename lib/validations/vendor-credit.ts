import { z } from "zod";

/**
 * Vendor Credit — zod schemas per <vendor_credits_spec>.
 *
 * Per master prompt:
 *   - Number prefix is `CN-` (Zoho UI labels it "Credit Note#"; the
 *     module slug is `vendorCredit` so it doesn't collide with the
 *     sales `CreditNote` table which uses `CR-`).
 *   - Auto-generated via `getNextDocumentNumber(...,'VENDOR_CREDIT')`.
 *   - Multi-line: same TransactionLineItemsTable primitive with
 *     `accountColumnVisible='inline'`, `customerColumnVisible=false`.
 *
 * Three distinct schemas:
 *   - vendorCreditSchema — create/update payload
 *   - applyToBillSchema  — Apply Vendor Credit dialog
 *   - recordRefundSchema — Record Refund dialog
 */

export const vendorCreditLineSchema = z.object({
  itemId: z.string().nullable().optional(),
  position: z.coerce.number().int().nonnegative().default(0),
  name: z.string().min(1, "Item name required").max(500),
  description: z.string().max(2000).nullable().optional(),
  hsnSacCode: z.string().max(20).nullable().optional(),
  accountId: z.string().nullable().optional(),
  quantity: z.coerce.number().nonnegative().default(1),
  rate: z.coerce.number().nonnegative().default(0),
  taxId: z.string().nullable().optional(),
});
export type VendorCreditLineInput = z.input<typeof vendorCreditLineSchema>;

export const VENDOR_CREDIT_STATUSES = [
  "DRAFT",
  "OPEN",
  "CLOSED",
  "VOID",
] as const;
export type VendorCreditStatusValue =
  (typeof VENDOR_CREDIT_STATUSES)[number];

export const vendorCreditSchema = z.object({
  contactId: z.string().min(1, "Vendor required"),
  referenceNumber: z.string().max(80).nullable().optional(),
  date: z.coerce.date(),
  subject: z.string().max(500).nullable().optional(),
  accountsPayableId: z.string().nullable().optional(),
  placeOfSupply: z.string().nullable().optional(),
  status: z.enum(VENDOR_CREDIT_STATUSES).default("DRAFT"),
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
  reason: z.string().max(500).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  pdfTemplateId: z.string().nullable().optional(),
  lines: z
    .array(vendorCreditLineSchema)
    .min(1, "At least one line item required"),
});
export type VendorCreditInput = z.input<typeof vendorCreditSchema>;

/**
 * Apply a Vendor Credit to one or more open bills. Each row carries
 * `billId` + `amount`. Total of amounts ≤ vendor credit's remaining
 * balance (enforced at action layer).
 */
export const applyVendorCreditToBillSchema = z.object({
  vendorCreditId: z.string().min(1),
  applications: z
    .array(
      z.object({
        billId: z.string().min(1),
        amount: z.coerce.number().positive("Amount must be positive"),
      })
    )
    .min(1, "Apply to at least one bill"),
  appliedDate: z.coerce.date().default(() => new Date()),
});
export type ApplyVendorCreditInput = z.input<
  typeof applyVendorCreditToBillSchema
>;

/**
 * Record a Refund against a Vendor Credit. Refunds reduce the
 * remaining balance and create a VendorCreditRefund audit row.
 */
export const recordVendorCreditRefundSchema = z.object({
  vendorCreditId: z.string().min(1),
  amount: z.coerce.number().positive("Refund amount must be positive"),
  refundDate: z.coerce.date(),
  paymentMode: z
    .enum([
      "cash",
      "bank_transfer",
      "cheque",
      "credit_card",
      "upi",
      "other",
    ])
    .default("bank_transfer"),
  fromAccountId: z.string().nullable().optional(),
  reference: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type RecordVendorCreditRefundInput = z.input<
  typeof recordVendorCreditRefundSchema
>;
