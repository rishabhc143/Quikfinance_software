/**
 * Pure math for partial / full refund proportional reversal.
 *
 * Extracted from `refundPaymentAction` so it can be unit-tested in
 * isolation. The action still does Razorpay calls, audit logs, and
 * Prisma transactions — those stay there. Anything that's pure
 * arithmetic lives here.
 */

export type RefundRatioInput = {
  /** Amount the user requested to refund. > 0. */
  requestedAmount: number;
  /** Original PaymentReceived.amount (always positive). */
  originalAmount: number;
};

/**
 * `requestedAmount / originalAmount`. Used to scale every linked
 * allocation, the reversal row's amountUsedForInvoices, and the
 * reversal's amountInExcess proportionally.
 */
export function computeRefundRatio({
  requestedAmount,
  originalAmount,
}: RefundRatioInput): number {
  if (originalAmount <= 0) {
    throw new Error("originalAmount must be > 0");
  }
  if (requestedAmount <= 0) {
    throw new Error("requestedAmount must be > 0");
  }
  // Cap at 1 — defensive; callers should validate but a stale UI
  // could slip a value past.
  const r = requestedAmount / originalAmount;
  return r > 1 ? 1 : r;
}

/** A single payment-to-invoice allocation (just what the math needs). */
export type AllocationInput = {
  /** Invoice id — opaque, kept for caller bookkeeping. */
  invoiceId: string;
  /** Amount of this payment originally allocated to that invoice. */
  amount: number;
  /** Current `amountPaid` on the invoice (across all payments). */
  invoiceAmountPaid: number;
  /** Total of the invoice (what amountPaid maxes out at when PAID). */
  invoiceTotal: number;
  /** Invoice due-date — used to pick OVERDUE vs SENT after reversal. */
  invoiceDueDate: Date;
};

export type AllocationReversalResult = {
  invoiceId: string;
  /** Amount that was rolled back from this invoice's amountPaid. */
  reverseAmount: number;
  /** What the invoice's amountPaid is set to after the rollback. */
  newAmountPaid: number;
  /** Status the invoice transitions to. */
  newStatus: "PAID" | "PARTIALLY_PAID" | "SENT" | "OVERDUE";
};

/**
 * Compute the per-allocation rollback for a refund. Caller takes
 * the result and runs the corresponding `invoice.update` calls.
 *
 * Status rules (mirror what was inlined in refundPaymentAction):
 *  - newAmountPaid ≈ 0           → OVERDUE if past due, else SENT
 *  - newAmountPaid ≈ invoiceTotal → PAID
 *  - 0 < newAmountPaid < total   → PARTIALLY_PAID
 */
export function computeProportionalAllocationReversal(
  allocations: AllocationInput[],
  ratio: number,
  now: Date = new Date()
): AllocationReversalResult[] {
  const EPS = 0.0001;
  return allocations.map((a) => {
    const reverseAmount = a.amount * ratio;
    const newAmountPaid = Math.max(0, a.invoiceAmountPaid - reverseAmount);
    let newStatus: AllocationReversalResult["newStatus"];
    if (newAmountPaid <= EPS) {
      newStatus = a.invoiceDueDate < now ? "OVERDUE" : "SENT";
    } else if (newAmountPaid >= a.invoiceTotal - EPS) {
      newStatus = "PAID";
    } else {
      newStatus = "PARTIALLY_PAID";
    }
    return {
      invoiceId: a.invoiceId,
      reverseAmount,
      newAmountPaid,
      newStatus,
    };
  });
}
