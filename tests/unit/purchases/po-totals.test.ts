import { describe, it, expect } from "vitest";
import { computeDocument } from "@/lib/sales/totals";

/**
 * Purchase Order totals tests.
 *
 * Math is delegated to the shared `computeDocument` primitive — these
 * tests pin down the exact PO input shape (lines + document discount
 * + document tax with TDS/TCS semantics + adjustment) the form sends
 * to the action layer. If anyone tweaks the totals formula, these
 * fail loudly with the spec'd numbers.
 *
 * All outputs are strings with 4 decimal places (`Decimal(18,4)`
 * matches the DB column shape).
 */

describe("PO totals — single line, no extras", () => {
  it("returns subTotal = quantity × rate", () => {
    const out = computeDocument({
      lines: [{ quantity: 10, rate: 250 }],
    });
    expect(out.subTotal).toBe("2500.0000");
    expect(out.total).toBe("2500.0000");
  });

  it("rounds to 4 decimals at the line, not at the total", () => {
    const out = computeDocument({
      lines: [{ quantity: 3, rate: 33.333 }],
    });
    expect(out.subTotal).toBe("99.9990");
  });
});

describe("PO totals — line-level discount", () => {
  it("percentage discount reduces the line amount", () => {
    const out = computeDocument({
      lines: [
        { quantity: 4, rate: 100, discount: 10, discountType: "percentage" },
      ],
    });
    expect(out.subTotal).toBe("360.0000"); // 400 × (1 - 0.10)
  });

  it("amount discount subtracts directly", () => {
    const out = computeDocument({
      lines: [
        { quantity: 4, rate: 100, discount: 30, discountType: "amount" },
      ],
    });
    expect(out.subTotal).toBe("370.0000"); // 400 - 30
  });

  it("discount cannot push the line below zero", () => {
    const out = computeDocument({
      lines: [
        { quantity: 1, rate: 50, discount: 999, discountType: "amount" },
      ],
    });
    expect(out.subTotal).toBe("0.0000");
  });
});

describe("PO totals — line-level tax", () => {
  it("18% IGST adds on top of the discounted line", () => {
    const out = computeDocument({
      lines: [{ quantity: 10, rate: 100, taxRate: 18 }],
    });
    expect(out.subTotal).toBe("1000.0000");
    // total = subTotal + line tax (no doc tax here)
    expect(out.total).toBe("1180.0000");
  });
});

describe("PO totals — document-level discount", () => {
  it("percentage doc discount reduces the taxable base", () => {
    const out = computeDocument({
      lines: [{ quantity: 1, rate: 1000 }],
      documentDiscount: { value: 10, type: "percentage" },
    });
    expect(out.documentDiscountAmount).toBe("100.0000");
    expect(out.total).toBe("900.0000");
  });

  it("amount doc discount subtracts directly", () => {
    const out = computeDocument({
      lines: [{ quantity: 1, rate: 1000 }],
      documentDiscount: { value: 250, type: "amount" },
    });
    expect(out.documentDiscountAmount).toBe("250.0000");
    expect(out.total).toBe("750.0000");
  });
});

describe("PO totals — TDS vs TCS", () => {
  it("TDS deducts at source (subtracts from total)", () => {
    const out = computeDocument({
      lines: [{ quantity: 1, rate: 10_000 }],
      documentTax: { rate: 10, type: "TDS" },
    });
    // TDS deducts 10% of taxable base (= 10,000) → -1000
    expect(out.documentTaxAmount).toBe("-1000.0000");
    expect(out.total).toBe("9000.0000");
  });

  it("TCS collects at source (adds to total)", () => {
    const out = computeDocument({
      lines: [{ quantity: 1, rate: 10_000 }],
      documentTax: { rate: 5, type: "TCS" },
    });
    expect(out.documentTaxAmount).toBe("500.0000");
    expect(out.total).toBe("10500.0000");
  });
});

describe("PO totals — adjustment", () => {
  it("positive adjustment adds to the total", () => {
    const out = computeDocument({
      lines: [{ quantity: 1, rate: 100 }],
      adjustment: 12.5,
    });
    expect(out.adjustmentAmount).toBe("12.5000");
    expect(out.total).toBe("112.5000");
  });

  it("negative adjustment subtracts from the total", () => {
    const out = computeDocument({
      lines: [{ quantity: 1, rate: 100 }],
      adjustment: -7.25,
    });
    expect(out.adjustmentAmount).toBe("-7.2500");
    expect(out.total).toBe("92.7500");
  });
});

describe("PO totals — full stack (the realistic case)", () => {
  it("combines line discount + line tax + doc discount + TDS + adjustment", () => {
    // Two lines: 10 × 500 with 5% discount + 18% GST, and 2 × 1000 with no
    // discount + 12% GST. Document discount = 100 flat. TDS = 2%. Adj = 50.
    const out = computeDocument({
      lines: [
        {
          quantity: 10,
          rate: 500,
          discount: 5,
          discountType: "percentage",
          taxRate: 18,
        },
        { quantity: 2, rate: 1000, taxRate: 12 },
      ],
      documentDiscount: { value: 100, type: "amount" },
      documentTax: { rate: 2, type: "TDS" },
      adjustment: 50,
    });
    // Line 1: 5000 × 0.95 = 4750; line tax = 4750 × 0.18 = 855
    // Line 2: 2000; line tax = 2000 × 0.12 = 240
    // subTotal = 4750 + 2000 = 6750
    // doc discount = 100
    // taxable base = 6650
    // TDS = 6650 × 0.02 = 133  → applied as -133
    // total = taxable base + line tax sum + doc tax + adj
    //       = 6650 + (855 + 240) + (-133) + 50 = 7662
    expect(out.subTotal).toBe("6750.0000");
    expect(out.documentDiscountAmount).toBe("100.0000");
    expect(out.documentTaxAmount).toBe("-133.0000");
    expect(out.total).toBe("7662.0000");
  });
});
