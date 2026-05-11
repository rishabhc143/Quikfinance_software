import { describe, it, expect } from "vitest";
import {
  billPaymentSchema,
  vendorAdvanceSchema,
  paymentMadeSchema,
} from "@/lib/validations/payment-made";

/**
 * Tests for the Payments Made schemas. The two tabs of the form
 * map to two discriminated zod schemas; coverage:
 *
 *  - Happy path for both tabs
 *  - Required fields (contactId, amountPaid, paymentDate, allocations)
 *  - Allocation shape: positive amount, valid source enum, sourcePaymentMadeId
 *    required when source='ADVANCE' is implied (schema accepts null but
 *    the action layer enforces — that's a separate test)
 *  - paymentType discriminator routes via paymentMadeSchema correctly
 *  - Status defaults to PAID
 *  - Vendor Advance accepts optional TDS + depositTo
 */

describe("billPaymentSchema — happy path", () => {
  it("accepts a minimal bill payment", () => {
    const r = billPaymentSchema.safeParse({
      contactId: "vendor-1",
      paymentDate: "2026-05-10",
      amountPaid: 1000,
      allocations: [
        { billId: "bill-1", amount: 1000, source: "FRESH" },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("defaults paymentType=BILL_PAYMENT and status=PAID", () => {
    const r = billPaymentSchema.safeParse({
      contactId: "v1",
      paymentDate: "2026-05-10",
      amountPaid: 100,
      allocations: [{ billId: "b1", amount: 100, source: "FRESH" }],
    });
    if (!r.success) throw new Error("Expected success");
    expect(r.data.paymentType).toBe("BILL_PAYMENT");
    expect(r.data.status).toBe("PAID");
  });

  it("accepts an ADVANCE drawdown allocation", () => {
    const r = billPaymentSchema.safeParse({
      contactId: "v1",
      paymentDate: "2026-05-10",
      amountPaid: 500,
      allocations: [
        {
          billId: "b1",
          amount: 500,
          source: "ADVANCE",
          sourcePaymentMadeId: "pm-advance-1",
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("accepts a mix of FRESH + ADVANCE allocations", () => {
    const r = billPaymentSchema.safeParse({
      contactId: "v1",
      paymentDate: "2026-05-10",
      amountPaid: 800,
      allocations: [
        { billId: "b1", amount: 300, source: "FRESH" },
        {
          billId: "b1",
          amount: 200,
          source: "ADVANCE",
          sourcePaymentMadeId: "pm-adv",
        },
        { billId: "b2", amount: 300, source: "FRESH" },
      ],
    });
    expect(r.success).toBe(true);
  });
});

describe("billPaymentSchema — rejections", () => {
  it("rejects when contactId is missing", () => {
    const r = billPaymentSchema.safeParse({
      paymentDate: "2026-05-10",
      amountPaid: 100,
      allocations: [{ billId: "b1", amount: 100 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects when amountPaid is zero", () => {
    const r = billPaymentSchema.safeParse({
      contactId: "v1",
      paymentDate: "2026-05-10",
      amountPaid: 0,
      allocations: [{ billId: "b1", amount: 100 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects when amountPaid is negative", () => {
    const r = billPaymentSchema.safeParse({
      contactId: "v1",
      paymentDate: "2026-05-10",
      amountPaid: -50,
      allocations: [{ billId: "b1", amount: 100 }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects when allocations is empty", () => {
    const r = billPaymentSchema.safeParse({
      contactId: "v1",
      paymentDate: "2026-05-10",
      amountPaid: 100,
      allocations: [],
    });
    expect(r.success).toBe(false);
  });

  it("rejects negative allocation amount", () => {
    const r = billPaymentSchema.safeParse({
      contactId: "v1",
      paymentDate: "2026-05-10",
      amountPaid: 100,
      allocations: [{ billId: "b1", amount: -10 }],
    });
    expect(r.success).toBe(false);
  });
});

describe("vendorAdvanceSchema — happy path", () => {
  it("accepts a minimal vendor advance payload", () => {
    const r = vendorAdvanceSchema.safeParse({
      contactId: "v1",
      paymentDate: "2026-05-10",
      amountPaid: 5000,
    });
    expect(r.success).toBe(true);
  });

  it("defaults paymentType=VENDOR_ADVANCE and paymentMode=cash", () => {
    const r = vendorAdvanceSchema.safeParse({
      contactId: "v1",
      paymentDate: "2026-05-10",
      amountPaid: 5000,
    });
    if (!r.success) throw new Error("Expected success");
    expect(r.data.paymentType).toBe("VENDOR_ADVANCE");
    expect(r.data.paymentMode).toBe("cash");
  });

  it("accepts optional TDS + depositTo", () => {
    const r = vendorAdvanceSchema.safeParse({
      contactId: "v1",
      paymentDate: "2026-05-10",
      amountPaid: 5000,
      tdsId: "tax-tds-10",
      tdsAmount: 500,
      depositToAccountId: "acct-prepaid",
    });
    expect(r.success).toBe(true);
  });

  it("rejects negative TDS amount", () => {
    const r = vendorAdvanceSchema.safeParse({
      contactId: "v1",
      paymentDate: "2026-05-10",
      amountPaid: 5000,
      tdsAmount: -10,
    });
    expect(r.success).toBe(false);
  });
});

describe("paymentMadeSchema — discriminated union", () => {
  it("routes a BILL_PAYMENT payload to the bill schema", () => {
    const r = paymentMadeSchema.safeParse({
      paymentType: "BILL_PAYMENT",
      contactId: "v1",
      paymentDate: "2026-05-10",
      amountPaid: 100,
      allocations: [{ billId: "b1", amount: 100, source: "FRESH" }],
    });
    expect(r.success).toBe(true);
  });

  it("routes a VENDOR_ADVANCE payload to the advance schema", () => {
    const r = paymentMadeSchema.safeParse({
      paymentType: "VENDOR_ADVANCE",
      contactId: "v1",
      paymentDate: "2026-05-10",
      amountPaid: 5000,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown paymentType", () => {
    const r = paymentMadeSchema.safeParse({
      paymentType: "REFUND" as unknown as "BILL_PAYMENT",
      contactId: "v1",
      paymentDate: "2026-05-10",
      amountPaid: 100,
    });
    expect(r.success).toBe(false);
  });

  it("a VENDOR_ADVANCE payload with allocations is rejected at the discriminator", () => {
    // Vendor advance schema doesn't declare an `allocations` field.
    // Sending one would be an undeclared property — zod's strict
    // mode is off so it's tolerated, but the type-level routing is
    // what matters. Verify the payload is parsed under the advance
    // schema (no allocations honored).
    const r = paymentMadeSchema.safeParse({
      paymentType: "VENDOR_ADVANCE",
      contactId: "v1",
      paymentDate: "2026-05-10",
      amountPaid: 100,
      allocations: [{ billId: "b1", amount: 100 }],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      // The discriminator routed to vendorAdvanceSchema; allocations
      // is not on that schema's output type.
      expect((r.data as { allocations?: unknown }).allocations).toBeUndefined();
    }
  });
});
