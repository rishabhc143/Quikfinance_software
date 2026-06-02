import { z } from "zod";
import { attachmentsField } from "./shared-fields";

/**
 * Payments Made — zod schemas. Two distinct shapes per the
 * <payments_made_spec> two-tab form:
 *
 *   BillPayment   — vendor settles open bills. Optional Vendor
 *                   Advance drawdown when the vendor has an
 *                   available advance balance.
 *   VendorAdvance — vendor receives money to be drawn against
 *                   future bills. Sits in a "Prepaid Expenses"
 *                   account until consumed.
 *
 * Both write a PaymentMade row + zero-or-more
 * PaymentMadeAllocation rows. The `paymentType` discriminator
 * routes the action layer's branch.
 */

export const PAYMENT_MODES = [
  "cash",
  "bank_transfer",
  "cheque",
  "credit_card",
  "upi",
  "other",
] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** Single allocation entry — drawdown OR fresh-cash. */
export const paymentAllocationSchema = z.object({
  billId: z.string().min(1),
  /** How much of this payment to apply to the bill. */
  amount: z.coerce.number().positive("Allocation amount must be positive"),
  /**
   * When set, this allocation is sourced from an existing
   * VENDOR_ADVANCE PaymentMade row (drawdown). The action layer
   * creates a PaymentMadeAllocation against THAT row instead of the
   * new BillPayment row, so the advance balance decreases.
   *
   * Defaults to "FRESH" — the allocation is a normal cash payment.
   */
  source: z.enum(["FRESH", "ADVANCE"]).default("FRESH"),
  /** Required when source='ADVANCE'. The PaymentMade.id whose
   *  paymentType=VENDOR_ADVANCE balance this allocation draws from. */
  sourcePaymentMadeId: z.string().nullable().optional(),
});

/**
 * Bill Payment tab payload. The user picks one or more open bills
 * for the selected vendor and enters an amount per row. Excess
 * (paymentAmount > sum-of-allocations) is recorded as an
 * advance-pending balance in the same payment row via
 * `amountInExcess`. The action layer auto-spawns a paired
 * VENDOR_ADVANCE PaymentMade row when amountInExcess > 0.
 */
export const billPaymentSchema = z.object({
  paymentType: z.literal("BILL_PAYMENT").default("BILL_PAYMENT"),
  contactId: z.string().min(1, "Vendor required"),
  paymentDate: z.coerce.date(),
  /** Total amount paid (may exceed sum-of-allocations → excess → advance). */
  amountPaid: z.coerce.number().positive("Payment amount must be positive"),
  paymentMode: z.enum(PAYMENT_MODES).default("cash"),
  paidThroughAccountId: z.string().nullable().optional(),
  reference: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  /**
   * One row per Bill the user is touching with this payment. The
   * `source` discriminator tells the action whether the row's amount
   * comes from new cash or draws down an existing advance.
   */
  allocations: z.array(paymentAllocationSchema).min(1, "Allocate to at least one bill"),
  attachments: attachmentsField(5),
  status: z.enum(["DRAFT", "PAID"]).default("PAID"),
});
export type BillPaymentInput = z.input<typeof billPaymentSchema>;

/**
 * Vendor Advance tab payload. The org pays a vendor without
 * applying it to any specific bill yet. The PaymentMade row uses
 * paymentType=VENDOR_ADVANCE; later Bill Payments can draw down
 * against it via the `source='ADVANCE'` allocation flag above.
 */
export const vendorAdvanceSchema = z.object({
  paymentType: z.literal("VENDOR_ADVANCE").default("VENDOR_ADVANCE"),
  contactId: z.string().min(1, "Vendor required"),
  paymentDate: z.coerce.date(),
  amountPaid: z.coerce.number().positive("Payment amount must be positive"),
  paymentMode: z.enum(PAYMENT_MODES).default("cash"),
  paidThroughAccountId: z.string().nullable().optional(),
  /** Where the advance sits — Prepaid Expenses by default. Vendor
   *  Advance-specific (NOT used on Bill Payment). */
  depositToAccountId: z.string().nullable().optional(),
  /** TDS at source — applied to the advance per India compliance. */
  tdsId: z.string().nullable().optional(),
  tdsAmount: z.coerce.number().nonnegative().nullable().optional(),
  reference: z.string().max(120).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  attachments: attachmentsField(5),
  status: z.enum(["DRAFT", "PAID"]).default("PAID"),
});
export type VendorAdvanceInput = z.input<typeof vendorAdvanceSchema>;

/** Discriminated union — convenient when the caller doesn't know
 *  which tab the form was on. */
export const paymentMadeSchema = z.discriminatedUnion("paymentType", [
  billPaymentSchema,
  vendorAdvanceSchema,
]);
export type PaymentMadeInput = z.input<typeof paymentMadeSchema>;
