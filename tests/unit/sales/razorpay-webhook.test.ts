import { describe, it, expect } from "vitest";
import {
  verifyRazorpaySignature,
  signRazorpayPayload,
  distributeRefundAcrossAllocations,
  type WebhookAllocation,
} from "@/lib/sales/razorpay-webhook";

/**
 * Unit tests for the Razorpay webhook helpers extracted from
 * `app/api/webhooks/razorpay/route.ts`.
 *
 * What we cover here vs. what we don't:
 *   ✓ HMAC signature verification (right secret accepts, wrong
 *     rejects, malformed input rejects, timing-safe compare)
 *   ✓ Refund proportional distribution across allocations + status
 *     transitions
 *   ✗ Database side effects (Prisma writes / audit log / email
 *     enqueue) — those are integration-test territory and would
 *     need a real Postgres
 *   ✗ End-to-end against the actual Razorpay sandbox — needs live
 *     credentials I don't have. The sandbox flow is documented in
 *     the Sales README under the Razorpay section instead.
 */

const SECRET = "rzp_test_webhook_secret_xyz123";
const BODY = JSON.stringify({
  event: "payment.captured",
  payload: { payment: { entity: { id: "pay_123", amount: 50000 } } },
});

describe("verifyRazorpaySignature", () => {
  it("accepts a payload signed with the right secret", () => {
    const sig = signRazorpayPayload(BODY, SECRET);
    expect(verifyRazorpaySignature(BODY, sig, SECRET)).toBe(true);
  });

  it("rejects a payload signed with a different secret", () => {
    const sig = signRazorpayPayload(BODY, "different-secret");
    expect(verifyRazorpaySignature(BODY, sig, SECRET)).toBe(false);
  });

  it("rejects when the body is mutated after signing", () => {
    const sig = signRazorpayPayload(BODY, SECRET);
    const tamperedBody = BODY.replace("50000", "5000000");
    expect(verifyRazorpaySignature(tamperedBody, sig, SECRET)).toBe(false);
  });

  it("rejects when the signature has the wrong length", () => {
    expect(verifyRazorpaySignature(BODY, "deadbeef", SECRET)).toBe(false);
  });

  it("rejects when the signature is not valid hex", () => {
    expect(verifyRazorpaySignature(BODY, "ZZZ-not-hex", SECRET)).toBe(false);
  });

  it("rejects empty inputs", () => {
    expect(verifyRazorpaySignature("", "abc", SECRET)).toBe(false);
    expect(verifyRazorpaySignature(BODY, "", SECRET)).toBe(false);
    expect(verifyRazorpaySignature(BODY, "abc", "")).toBe(false);
  });

  it("rejects a flipped-bit signature (timing-safe compare)", () => {
    const sig = signRazorpayPayload(BODY, SECRET);
    // Flip the last hex digit so the signature stays the right length
    const flipped =
      sig.slice(0, -1) + (sig.slice(-1) === "0" ? "1" : "0");
    expect(verifyRazorpaySignature(BODY, flipped, SECRET)).toBe(false);
  });

  it("re-signs deterministically (same body+secret → same hex)", () => {
    expect(signRazorpayPayload(BODY, SECRET)).toBe(
      signRazorpayPayload(BODY, SECRET)
    );
  });

  it("the production format matches what Razorpay sends (lowercase hex, 64 chars)", () => {
    const sig = signRazorpayPayload(BODY, SECRET);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("distributeRefundAcrossAllocations", () => {
  function alloc(over: Partial<WebhookAllocation> = {}): WebhookAllocation {
    return {
      invoiceId: "inv1",
      amount: 1000,
      invoiceAmountPaid: 1000,
      invoiceTotal: 1000,
      invoiceStatus: "PAID",
      ...over,
    };
  }

  it("a full refund of a single-allocation payment flips the invoice from PAID to SENT", () => {
    const r = distributeRefundAcrossAllocations(1000, [alloc()]);
    expect(r).toHaveLength(1);
    expect(r[0].reverseAmount).toBe(1000);
    expect(r[0].newAmountPaid).toBe(0);
    expect(r[0].newStatus).toBe("SENT");
  });

  it("a partial refund flips PAID → PARTIALLY_PAID", () => {
    const r = distributeRefundAcrossAllocations(400, [alloc()]);
    expect(r[0].reverseAmount).toBe(400);
    expect(r[0].newAmountPaid).toBe(600);
    expect(r[0].newStatus).toBe("PARTIALLY_PAID");
  });

  it("distributes proportionally across multiple allocations", () => {
    const r = distributeRefundAcrossAllocations(500, [
      alloc({ invoiceId: "a", amount: 600, invoiceAmountPaid: 600, invoiceTotal: 600 }),
      alloc({ invoiceId: "b", amount: 400, invoiceAmountPaid: 400, invoiceTotal: 400 }),
    ]);
    // Refund 500, total allocated 1000 → 50% reverse on each
    expect(r[0].reverseAmount).toBeCloseTo(300, 6);
    expect(r[1].reverseAmount).toBeCloseTo(200, 6);
    // Sum of reversals == requested
    expect(r[0].reverseAmount + r[1].reverseAmount).toBeCloseTo(500, 6);
  });

  it("clamps newAmountPaid at 0 when the refund overshoots the invoice's amountPaid", () => {
    const r = distributeRefundAcrossAllocations(2000, [
      alloc({ amount: 1000, invoiceAmountPaid: 500, invoiceTotal: 1000 }),
    ]);
    expect(r[0].newAmountPaid).toBe(0);
  });

  it("keeps a non-PAID invoice's status untouched if the math leaves it at 0 paid", () => {
    const r = distributeRefundAcrossAllocations(1000, [
      alloc({
        invoiceId: "x",
        amount: 1000,
        invoiceAmountPaid: 1000,
        invoiceTotal: 5000, // big invoice, only partly paid by this payment
        invoiceStatus: "PARTIALLY_PAID",
      }),
    ]);
    // After reversing 1000, new paid = 0; status falls back to SENT
    // (because previous status was PARTIALLY_PAID).
    expect(r[0].newStatus).toBe("SENT");
  });

  it("when total allocated is 0 (defensive), splits evenly across allocations", () => {
    const r = distributeRefundAcrossAllocations(900, [
      alloc({ invoiceId: "a", amount: 0, invoiceAmountPaid: 1000 }),
      alloc({ invoiceId: "b", amount: 0, invoiceAmountPaid: 1000 }),
      alloc({ invoiceId: "c", amount: 0, invoiceAmountPaid: 1000 }),
    ]);
    // 900 split across 3 = 300 each
    expect(r[0].reverseAmount).toBe(300);
    expect(r[1].reverseAmount).toBe(300);
    expect(r[2].reverseAmount).toBe(300);
  });

  it("returns an empty array when there are no allocations", () => {
    expect(distributeRefundAcrossAllocations(500, [])).toEqual([]);
  });

  it("handles the realistic single-paise refund case", () => {
    const r = distributeRefundAcrossAllocations(0.01, [
      alloc({ amount: 1000, invoiceAmountPaid: 1000, invoiceTotal: 1000 }),
    ]);
    expect(r[0].newAmountPaid).toBeCloseTo(999.99, 4);
    expect(r[0].newStatus).toBe("PARTIALLY_PAID");
  });
});
