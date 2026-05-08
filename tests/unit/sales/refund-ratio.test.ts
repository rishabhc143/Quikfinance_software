import { describe, it, expect } from "vitest";
import {
  computeRefundRatio,
  computeProportionalAllocationReversal,
  type AllocationInput,
} from "@/lib/sales/refund-math";

const FUTURE_DUE = new Date("2030-01-01T00:00:00Z");
const PAST_DUE = new Date("2020-01-01T00:00:00Z");

function alloc(over: Partial<AllocationInput> = {}): AllocationInput {
  return {
    invoiceId: "inv1",
    amount: 1000,
    invoiceAmountPaid: 1000,
    invoiceTotal: 1000,
    invoiceDueDate: FUTURE_DUE,
    ...over,
  };
}

describe("computeRefundRatio", () => {
  it("ratio = 1 for a full refund", () => {
    expect(
      computeRefundRatio({ requestedAmount: 1000, originalAmount: 1000 })
    ).toBe(1);
  });

  it("ratio = 0.5 for a half refund", () => {
    expect(
      computeRefundRatio({ requestedAmount: 500, originalAmount: 1000 })
    ).toBe(0.5);
  });

  it("ratio = 0.0001 for a 1-paise refund on a ₹100 payment", () => {
    expect(
      computeRefundRatio({ requestedAmount: 0.01, originalAmount: 100 })
    ).toBeCloseTo(0.0001, 8);
  });

  it("caps the ratio at 1 if requested somehow exceeds original", () => {
    expect(
      computeRefundRatio({ requestedAmount: 2000, originalAmount: 1000 })
    ).toBe(1);
  });

  it("throws when originalAmount <= 0", () => {
    expect(() =>
      computeRefundRatio({ requestedAmount: 100, originalAmount: 0 })
    ).toThrow();
  });

  it("throws when requestedAmount <= 0", () => {
    expect(() =>
      computeRefundRatio({ requestedAmount: 0, originalAmount: 1000 })
    ).toThrow();
  });
});

describe("computeProportionalAllocationReversal", () => {
  it("full refund (ratio=1) zeros out a fully-paid invoice and marks it SENT (future due)", () => {
    const r = computeProportionalAllocationReversal([alloc()], 1);
    expect(r).toHaveLength(1);
    expect(r[0].reverseAmount).toBe(1000);
    expect(r[0].newAmountPaid).toBe(0);
    expect(r[0].newStatus).toBe("SENT");
  });

  it("full refund on a past-due invoice flips to OVERDUE", () => {
    const r = computeProportionalAllocationReversal(
      [alloc({ invoiceDueDate: PAST_DUE })],
      1,
      new Date("2025-01-01T00:00:00Z")
    );
    expect(r[0].newStatus).toBe("OVERDUE");
  });

  it("50% refund on a fully-paid invoice transitions to PARTIALLY_PAID", () => {
    const r = computeProportionalAllocationReversal(
      [alloc({ amount: 1000, invoiceAmountPaid: 1000, invoiceTotal: 1000 })],
      0.5
    );
    expect(r[0].reverseAmount).toBe(500);
    expect(r[0].newAmountPaid).toBe(500);
    expect(r[0].newStatus).toBe("PARTIALLY_PAID");
  });

  it("scales every allocation by the same ratio across multiple invoices", () => {
    const r = computeProportionalAllocationReversal(
      [
        alloc({ invoiceId: "a", amount: 600, invoiceAmountPaid: 600, invoiceTotal: 600 }),
        alloc({ invoiceId: "b", amount: 400, invoiceAmountPaid: 400, invoiceTotal: 400 }),
      ],
      0.5
    );
    expect(r[0].reverseAmount).toBe(300);
    expect(r[1].reverseAmount).toBe(200);
    // sum of reversals == requested (600+400) × 0.5 = 500
    expect(r[0].reverseAmount + r[1].reverseAmount).toBe(500);
  });

  it("status PAID when newAmountPaid is still ≈ invoice total (overpaid case)", () => {
    // Invoice total 1000, allocation amount 200 (so 800 came from
    // another payment); ratio 0.1 → reverseAmount 20 → newAmountPaid
    // 980 (still less than total), so PARTIALLY_PAID.
    // For PAID we need newAmountPaid >= total within EPS:
    const r = computeProportionalAllocationReversal(
      [
        alloc({
          amount: 50,
          invoiceAmountPaid: 1000,
          invoiceTotal: 1000,
        }),
      ],
      0
      // ratio 0 → reverseAmount 0 → newAmountPaid stays at 1000 → PAID
    );
    expect(r[0].newStatus).toBe("PAID");
  });

  it("clamps newAmountPaid at 0 when reverseAmount > invoiceAmountPaid", () => {
    const r = computeProportionalAllocationReversal(
      [
        alloc({
          amount: 1000,
          invoiceAmountPaid: 500, // less than allocation amount (e.g. partial refund already happened)
          invoiceTotal: 1000,
        }),
      ],
      1
    );
    expect(r[0].newAmountPaid).toBe(0); // clamped, not -500
  });

  it("returns an empty array when there are no allocations", () => {
    expect(computeProportionalAllocationReversal([], 0.5)).toEqual([]);
  });

  it("preserves invoiceId order — reversals returned in input order", () => {
    const r = computeProportionalAllocationReversal(
      [
        alloc({ invoiceId: "third" }),
        alloc({ invoiceId: "first" }),
        alloc({ invoiceId: "second" }),
      ],
      0.5
    );
    expect(r.map((x) => x.invoiceId)).toEqual(["third", "first", "second"]);
  });
});
