import { describe, it, expect } from "vitest";
import { computeLine, computeDocument } from "@/lib/sales/totals";

/**
 * Unit tests for the money math in lib/sales/totals.ts.
 *
 * These cover the riskiest server-only logic: line totals, GST,
 * discounts (% and amount, line and document level), TDS/TCS, and
 * adjustments. A regression here would silently corrupt every
 * invoice, quote, sales order, etc.
 */

describe("computeLine", () => {
  it("computes qty × rate baseline (no discount, no tax)", () => {
    const r = computeLine({ quantity: 3, rate: 100 });
    expect(r.amount).toBe("300.0000");
    expect(r.taxAmount).toBe("0.0000");
    expect(r.amountWithTax).toBe("300.0000");
  });

  it("applies a percentage discount before tax", () => {
    const r = computeLine({
      quantity: 2,
      rate: 100,
      discount: 10,
      discountType: "percentage",
    });
    // 200 - 10% = 180
    expect(r.amount).toBe("180.0000");
  });

  it("applies a fixed-amount discount before tax", () => {
    const r = computeLine({
      quantity: 1,
      rate: 1000,
      discount: 50,
      discountType: "amount",
    });
    expect(r.amount).toBe("950.0000");
  });

  it("clamps a fixed-amount discount that exceeds the line total to zero", () => {
    const r = computeLine({
      quantity: 1,
      rate: 100,
      discount: 999,
      discountType: "amount",
    });
    expect(r.amount).toBe("0.0000");
  });

  it("caps a percentage discount at 100", () => {
    const r = computeLine({
      quantity: 2,
      rate: 100,
      discount: 250,
      discountType: "percentage",
    });
    expect(r.amount).toBe("0.0000");
  });

  it("applies tax to the post-discount amount", () => {
    const r = computeLine({
      quantity: 2,
      rate: 100,
      discount: 10,
      discountType: "percentage",
      taxRate: 18,
    });
    // gross = 180; tax = 180 × 0.18 = 32.40; total = 212.40
    expect(r.amount).toBe("180.0000");
    expect(r.taxAmount).toBe("32.4000");
    expect(r.amountWithTax).toBe("212.4000");
  });

  it("returns zeros for zero quantity", () => {
    const r = computeLine({ quantity: 0, rate: 100, taxRate: 18 });
    expect(r.amount).toBe("0.0000");
    expect(r.taxAmount).toBe("0.0000");
    expect(r.amountWithTax).toBe("0.0000");
  });

  it("uses Decimal precision (avoids 0.1 + 0.2 floating-point traps)", () => {
    // 0.1 × 3 with Number is 0.30000000000000004; with Decimal it's 0.3
    const r = computeLine({ quantity: 3, rate: 0.1 });
    expect(r.amount).toBe("0.3000");
  });

  it("handles string inputs (Prisma Decimal columns serialize as strings)", () => {
    const r = computeLine({ quantity: "1.5", rate: "200" });
    expect(r.amount).toBe("300.0000");
  });

  it("fractional rate × fractional quantity → 4-decimal precision", () => {
    const r = computeLine({ quantity: 1.25, rate: 99.99 });
    // 1.25 × 99.99 = 124.9875
    expect(r.amount).toBe("124.9875");
  });
});

describe("computeDocument", () => {
  it("aggregates subtotal across multiple lines", () => {
    const r = computeDocument({
      lines: [
        { quantity: 2, rate: 100 },
        { quantity: 3, rate: 50 },
      ],
    });
    expect(r.subTotal).toBe("350.0000");
    expect(r.total).toBe("350.0000");
  });

  it("applies a document-level percentage discount", () => {
    const r = computeDocument({
      lines: [{ quantity: 1, rate: 1000 }],
      documentDiscount: { value: 10, type: "percentage" },
    });
    expect(r.subTotal).toBe("1000.0000");
    expect(r.documentDiscountAmount).toBe("100.0000");
    expect(r.total).toBe("900.0000");
  });

  it("applies a document-level fixed-amount discount", () => {
    const r = computeDocument({
      lines: [{ quantity: 1, rate: 1000 }],
      documentDiscount: { value: 250, type: "amount" },
    });
    expect(r.documentDiscountAmount).toBe("250.0000");
    expect(r.total).toBe("750.0000");
  });

  it("TCS adds tax on top of taxable base", () => {
    const r = computeDocument({
      lines: [{ quantity: 1, rate: 1000 }],
      documentTax: { rate: 1, type: "TCS" },
    });
    // Base 1000, TCS 1% = +10
    expect(r.documentTaxAmount).toBe("10.0000");
    expect(r.total).toBe("1010.0000");
  });

  it("TDS subtracts tax from total", () => {
    const r = computeDocument({
      lines: [{ quantity: 1, rate: 1000 }],
      documentTax: { rate: 10, type: "TDS" },
    });
    // Base 1000, TDS 10% deducted = -100, total = 900
    expect(r.documentTaxAmount).toBe("-100.0000");
    expect(r.total).toBe("900.0000");
  });

  it("applies positive and negative adjustments", () => {
    const positive = computeDocument({
      lines: [{ quantity: 1, rate: 100 }],
      adjustment: 5,
    });
    expect(positive.total).toBe("105.0000");

    const negative = computeDocument({
      lines: [{ quantity: 1, rate: 100 }],
      adjustment: -7,
    });
    expect(negative.total).toBe("93.0000");
  });

  it("composes line tax + document discount + TCS + adjustment correctly", () => {
    // Indian GST invoice with 18% line tax, 5% document discount,
    // 1% TCS, and a small rounding adjustment.
    const r = computeDocument({
      lines: [
        { quantity: 2, rate: 1000, taxRate: 18 },
        { quantity: 1, rate: 500, taxRate: 18 },
      ],
      documentDiscount: { value: 5, type: "percentage" },
      documentTax: { rate: 1, type: "TCS" },
      adjustment: 0.5,
    });
    // Line gross subtotal: (2*1000) + (1*500) = 2500
    // Line tax: 2500 × 18% = 450  (sum of per-line tax)
    // Document discount on subtotal: 2500 × 5% = 125
    // Taxable base for doc tax: 2500 − 125 = 2375
    // TCS 1% of 2375 = 23.75
    // Total: 2375 (taxable base) + 450 (line tax) + 23.75 (TCS) + 0.5 (adj)
    //      = 2849.25
    expect(r.subTotal).toBe("2500.0000");
    expect(r.documentDiscountAmount).toBe("125.0000");
    expect(r.documentTaxAmount).toBe("23.7500");
    expect(r.adjustmentAmount).toBe("0.5000");
    expect(r.total).toBe("2849.2500");
  });

  it("returns clean zeros for empty lines", () => {
    const r = computeDocument({ lines: [] });
    expect(r.subTotal).toBe("0.0000");
    expect(r.total).toBe("0.0000");
    expect(r.lines).toEqual([]);
  });
});
