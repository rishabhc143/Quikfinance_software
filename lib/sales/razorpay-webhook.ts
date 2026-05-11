import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Pure helpers for the Razorpay webhook handler. Extracted for unit
 * testing — the route handler in
 * `app/api/webhooks/razorpay/route.ts` calls these so the logic is
 * exercised both by tests and in production.
 *
 * Nothing here touches the database; everything is deterministic and
 * synchronous.
 */

/**
 * Verify a Razorpay webhook signature against the raw request body.
 *
 * Razorpay computes `HMAC-SHA256(secret, raw_body)` and ships it in
 * the `x-razorpay-signature` header as a hex string. We re-compute
 * with the secret on file and compare in constant time.
 *
 * Returns false on any failure path (invalid hex, length mismatch,
 * mismatched bytes) — callers should treat the request as untrusted.
 */
export function verifyRazorpaySignature(
  rawBody: string,
  signatureHex: string,
  secret: string
): boolean {
  if (!rawBody || !signatureHex || !secret) return false;
  let actual: Buffer;
  try {
    actual = Buffer.from(signatureHex, "hex");
  } catch {
    return false;
  }
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * Sign a payload the way Razorpay does — used by tests to synthesize
 * legitimate signed deliveries. Production code never needs this.
 */
export function signRazorpayPayload(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/* ------------------------------------------------------------------ */
/* Refund proportional distribution                                   */
/* ------------------------------------------------------------------ */

export type WebhookAllocation = {
  invoiceId: string;
  amount: number;
  invoiceAmountPaid: number;
  invoiceTotal: number;
  invoiceStatus: string;
};

export type WebhookAllocationReversal = {
  invoiceId: string;
  reverseAmount: number;
  newAmountPaid: number;
  /** Null = no change; only set when status should transition. */
  newStatus: string;
};

/**
 * Distribute a webhook-fired refund across the original payment's
 * allocations proportionally, mirroring the math currently inlined
 * in `handleRefundProcessed`.
 *
 * Differs from `lib/sales/refund-math.ts` in two ways:
 *   1. The refund amount is given outright (Razorpay decides), not
 *      derived from a ratio
 *   2. Status transitions read inv.status to know where to fall back
 *      to (vs always SENT/OVERDUE) — matters for invoices that were
 *      already PAID before the refund event hit
 */
export function distributeRefundAcrossAllocations(
  refundAmount: number,
  allocations: WebhookAllocation[]
): WebhookAllocationReversal[] {
  if (allocations.length === 0) return [];
  const EPS = 0.0001;
  const totalAllocated = allocations.reduce((s, a) => s + a.amount, 0);
  return allocations.map((a) => {
    const share =
      totalAllocated > 0
        ? a.amount / totalAllocated
        : 1 / allocations.length;
    const reverse = refundAmount * share;
    const newAmountPaid = Math.max(0, a.invoiceAmountPaid - reverse);
    let newStatus: string;
    if (newAmountPaid >= a.invoiceTotal - EPS) {
      newStatus = "PAID";
    } else if (newAmountPaid > 0) {
      newStatus = "PARTIALLY_PAID";
    } else if (a.invoiceStatus === "PAID" || a.invoiceStatus === "PARTIALLY_PAID") {
      newStatus = "SENT";
    } else {
      newStatus = a.invoiceStatus;
    }
    return {
      invoiceId: a.invoiceId,
      reverseAmount: reverse,
      newAmountPaid,
      newStatus,
    };
  });
}
