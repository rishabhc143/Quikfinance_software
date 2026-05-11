import { describe, it, expect } from "vitest";
import {
  vendorCreditSchema,
  applyVendorCreditToBillSchema,
  recordVendorCreditRefundSchema,
} from "@/lib/validations/vendor-credit";

/**
 * Tests for the Vendor Credit zod schemas.
 *
 * Three schemas:
 *  - vendorCreditSchema — create/update payload (multi-line)
 *  - applyVendorCreditToBillSchema — Apply dialog payload
 *  - recordVendorCreditRefundSchema — Refund dialog payload
 */

function baseCredit(over: Partial<Record<string, unknown>> = {}) {
  return {
    contactId: "vendor-1",
    date: "2026-05-10",
    lines: [{ name: "Returned widgets", quantity: 5, rate: 100 }],
    ...over,
  };
}

describe("vendorCreditSchema — happy path", () => {
  it("accepts a minimal credit", () => {
    const r = vendorCreditSchema.safeParse(baseCredit());
    expect(r.success).toBe(true);
  });
  it("defaults status to DRAFT", () => {
    const r = vendorCreditSchema.safeParse(baseCredit());
    if (!r.success) throw new Error("Expected success");
    expect(r.data.status).toBe("DRAFT");
  });
  it("accepts a full payload with tax + reason + line accountId", () => {
    const r = vendorCreditSchema.safeParse(
      baseCredit({
        referenceNumber: "RET-001",
        subject: "Q1 hardware returns",
        placeOfSupply: "27",
        documentDiscount: { value: 5, type: "percentage" },
        documentTax: { taxId: "tax-1", type: "TDS" },
        reason: "Customer-returned goods sent back to vendor",
        lines: [
          {
            name: "Returned widget",
            quantity: 10,
            rate: 50,
            accountId: "acct-cogs",
            taxId: "tax-igst-18",
          },
        ],
      })
    );
    expect(r.success).toBe(true);
  });
});

describe("vendorCreditSchema — rejections", () => {
  it("rejects when contactId is missing", () => {
    const r = vendorCreditSchema.safeParse(baseCredit({ contactId: "" }));
    expect(r.success).toBe(false);
  });
  it("rejects empty lines array", () => {
    const r = vendorCreditSchema.safeParse(baseCredit({ lines: [] }));
    expect(r.success).toBe(false);
  });
  it("rejects negative quantity", () => {
    const r = vendorCreditSchema.safeParse(
      baseCredit({ lines: [{ name: "x", quantity: -1, rate: 100 }] })
    );
    expect(r.success).toBe(false);
  });
  it("rejects empty line.name", () => {
    const r = vendorCreditSchema.safeParse(
      baseCredit({ lines: [{ name: "", quantity: 1, rate: 100 }] })
    );
    expect(r.success).toBe(false);
  });
});

describe("applyVendorCreditToBillSchema", () => {
  it("accepts a single-bill application", () => {
    const r = applyVendorCreditToBillSchema.safeParse({
      vendorCreditId: "vc-1",
      applications: [{ billId: "b1", amount: 500 }],
    });
    expect(r.success).toBe(true);
  });
  it("accepts a multi-bill application", () => {
    const r = applyVendorCreditToBillSchema.safeParse({
      vendorCreditId: "vc-1",
      applications: [
        { billId: "b1", amount: 200 },
        { billId: "b2", amount: 300 },
      ],
    });
    expect(r.success).toBe(true);
  });
  it("rejects empty applications", () => {
    const r = applyVendorCreditToBillSchema.safeParse({
      vendorCreditId: "vc-1",
      applications: [],
    });
    expect(r.success).toBe(false);
  });
  it("rejects negative amount", () => {
    const r = applyVendorCreditToBillSchema.safeParse({
      vendorCreditId: "vc-1",
      applications: [{ billId: "b1", amount: -10 }],
    });
    expect(r.success).toBe(false);
  });
});

describe("recordVendorCreditRefundSchema", () => {
  it("accepts a minimal refund", () => {
    const r = recordVendorCreditRefundSchema.safeParse({
      vendorCreditId: "vc-1",
      amount: 250,
      refundDate: "2026-05-10",
    });
    expect(r.success).toBe(true);
  });
  it("defaults paymentMode to bank_transfer", () => {
    const r = recordVendorCreditRefundSchema.safeParse({
      vendorCreditId: "vc-1",
      amount: 250,
      refundDate: "2026-05-10",
    });
    if (!r.success) throw new Error("Expected success");
    expect(r.data.paymentMode).toBe("bank_transfer");
  });
  it("rejects zero amount", () => {
    const r = recordVendorCreditRefundSchema.safeParse({
      vendorCreditId: "vc-1",
      amount: 0,
      refundDate: "2026-05-10",
    });
    expect(r.success).toBe(false);
  });
  it("rejects invalid payment mode", () => {
    const r = recordVendorCreditRefundSchema.safeParse({
      vendorCreditId: "vc-1",
      amount: 100,
      refundDate: "2026-05-10",
      paymentMode: "crypto" as unknown as "cash",
    });
    expect(r.success).toBe(false);
  });
});
