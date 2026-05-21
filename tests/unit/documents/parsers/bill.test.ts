import { describe, it, expect } from "vitest";
import { parseBill, isParsedBill } from "@/lib/documents/parsers/bill";

describe("documents/parsers/bill", () => {
  describe("parseBill — complete tax invoice", () => {
    const text = `
TAX INVOICE

ABC Suppliers Pvt Ltd
123 Industrial Estate, Bengaluru
GSTIN: 29ABCDE1234F1Z5

Invoice Number: INV-2026-001
Invoice Date: 15/05/2026
Due Date: 14/06/2026

Bill To:
Customer Co
Bangalore

Description Rate Amount
1 Office Chair 5,000.00 5,000.00
2 Desk Lamp 1,500.00 3,000.00
3 Notebook 250.00 1,250.00

Sub Total 9,250.00
CGST @ 9% 832.50
SGST @ 9% 832.50
Grand Total 10,915.00
`;

    const parsed = parseBill(text);

    it("captures vendor name", () => {
      expect(parsed.vendorName?.toLowerCase()).toContain("abc");
    });
    it("captures GSTIN", () => {
      expect(parsed.gstin).toBe("29ABCDE1234F1Z5");
    });
    it("captures bill number", () => {
      expect(parsed.billNumber).toBe("INV-2026-001");
    });
    it("captures issue date", () => {
      expect(parsed.issueDate).toBe("2026-05-15");
    });
    it("captures due date", () => {
      expect(parsed.dueDate).toBe("2026-06-14");
    });
    it("captures sub-total", () => {
      expect(parsed.subTotal).toBe(9250);
    });
    it("sums tax amount (CGST + SGST)", () => {
      expect(parsed.taxAmount).toBeCloseTo(1665, 2);
    });
    it("captures grand total (largest match wins)", () => {
      expect(parsed.total).toBe(10915);
    });
    it("captures at least 3 line items", () => {
      expect(parsed.lineItems.length).toBeGreaterThanOrEqual(3);
    });
    it("line item descriptions are non-empty", () => {
      for (const item of parsed.lineItems) {
        expect(item.description.length).toBeGreaterThan(0);
        expect(item.amount).toBeGreaterThan(0);
      }
    });
  });

  describe("parseBill — IGST tax invoice (inter-state)", () => {
    const text = `
GST Invoice
XYZ Trading Co LLP
GSTIN 27XYZAB1234C1Z9
Invoice No: 2026/05/042
Date: 20/05/2026
Place of Supply: Maharashtra
IGST @ 18% 1,800.00
Total Amount 11,800.00
`;
    const parsed = parseBill(text);
    it("captures IGST as tax amount", () => {
      expect(parsed.taxAmount).toBeCloseTo(1800, 2);
    });
    it("captures total", () => {
      expect(parsed.total).toBe(11800);
    });
    it("captures GSTIN", () => {
      expect(parsed.gstin).toBe("27XYZAB1234C1Z9");
    });
    it("captures bill number with slashes", () => {
      expect(parsed.billNumber).toBe("2026/05/042");
    });
  });

  describe("parseBill — minimal bill", () => {
    const text = `
Quik Stationers
Bill: 2026-A1
Date: 01 May 2026
Total 500.00
`;
    const parsed = parseBill(text);
    it("captures vendor", () => {
      expect(parsed.vendorName?.toLowerCase()).toContain("stationers");
    });
    it("captures total", () => {
      expect(parsed.total).toBe(500);
    });
    it("returns null GSTIN when absent", () => {
      expect(parsed.gstin).toBeUndefined();
    });
    it("returns empty lineItems when no item rows present", () => {
      expect(parsed.lineItems).toEqual([]);
    });
  });

  describe("isParsedBill type guard", () => {
    it("accepts an object with lineItems array", () => {
      expect(isParsedBill({ lineItems: [] })).toBe(true);
      expect(isParsedBill({ lineItems: [{ description: "x", amount: 1 }] })).toBe(true);
    });
    it("rejects non-objects / missing lineItems", () => {
      expect(isParsedBill(null)).toBe(false);
      expect(isParsedBill(undefined)).toBe(false);
      expect(isParsedBill("string")).toBe(false);
      expect(isParsedBill({})).toBe(false);
      expect(isParsedBill({ lineItems: "not-array" })).toBe(false);
    });
  });
});
