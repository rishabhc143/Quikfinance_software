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

  // ───────── DOC-D5: HSN + qty/rate/amount extraction ─────────

  describe("parseBill — HSN-heavy tax invoice (D5)", () => {
    const text = `
TAX INVOICE

ABC Suppliers Pvt Ltd
Bengaluru
GSTIN: 29ABCDE1234F1Z5

Invoice Number: HSN-2026-001
Invoice Date: 15/05/2026

Sl No HSN Description Qty Rate Amount
1 9401 Office Chair 1 5000 5000
2 9405 Desk Lamp 2 1500 3000
3 8523 Notebook 5 250 1250

Sub Total 9250
CGST @ 9% 832.50
SGST @ 9% 832.50
Grand Total 10915
`;
    const parsed = parseBill(text);

    it("captures exactly 3 line items", () => {
      expect(parsed.lineItems.length).toBe(3);
    });
    it("captures HSN code per row", () => {
      expect(parsed.lineItems[0].hsn).toBe("9401");
      expect(parsed.lineItems[1].hsn).toBe("9405");
      expect(parsed.lineItems[2].hsn).toBe("8523");
    });
    it("captures quantity per row", () => {
      expect(parsed.lineItems[0].quantity).toBe(1);
      expect(parsed.lineItems[1].quantity).toBe(2);
      expect(parsed.lineItems[2].quantity).toBe(5);
    });
    it("captures rate per row", () => {
      expect(parsed.lineItems[0].rate).toBe(5000);
      expect(parsed.lineItems[1].rate).toBe(1500);
      expect(parsed.lineItems[2].rate).toBe(250);
    });
    it("captures amount per row", () => {
      expect(parsed.lineItems[0].amount).toBe(5000);
      expect(parsed.lineItems[1].amount).toBe(3000);
      expect(parsed.lineItems[2].amount).toBe(1250);
    });
    it("description excludes HSN code and serial number", () => {
      expect(parsed.lineItems[0].description).toBe("Office Chair");
      expect(parsed.lineItems[1].description).toBe("Desk Lamp");
      expect(parsed.lineItems[2].description).toBe("Notebook");
    });
  });

  describe("parseBill — mixed-format rows (D5)", () => {
    const text = `
TAX INVOICE
Mixed Format Co
GSTIN: 27ABCDE5678F1Z9
Invoice No: MIX-001
Date: 20/05/2026

1 Office Chair 2 1500 3000
2 Desk Lamp 1000 1000
3 Stationery Bundle 500

Total 4500
`;
    const parsed = parseBill(text);

    it("captures 3 line items across mixed formats", () => {
      expect(parsed.lineItems.length).toBe(3);
    });
    it("3-token row captures qty + rate + amount", () => {
      const r = parsed.lineItems[0];
      expect(r.description).toBe("Office Chair");
      expect(r.quantity).toBe(2);
      expect(r.rate).toBe(1500);
      expect(r.amount).toBe(3000);
    });
    it("2-token row captures rate + amount, no quantity", () => {
      const r = parsed.lineItems[1];
      expect(r.description).toBe("Desk Lamp");
      expect(r.quantity).toBeUndefined();
      expect(r.rate).toBe(1000);
      expect(r.amount).toBe(1000);
    });
    it("1-token row captures amount only, no rate / quantity", () => {
      const r = parsed.lineItems[2];
      expect(r.description).toBe("Stationery Bundle");
      expect(r.quantity).toBeUndefined();
      expect(r.rate).toBeUndefined();
      expect(r.amount).toBe(500);
    });
  });

  describe("parseBill — footer noise is skipped (D5)", () => {
    const text = `
TAX INVOICE
Noise Test LLP
GSTIN: 27NOISE7890A1Z2
Invoice No: NOISE-001
Date: 22/05/2026

1 Widget A 100 100
2 Widget B 200 200

Sub Total 300
Round Off 0.50
CGST @ 9% 27
Grand Total 327
In Words: Three hundred twenty seven only
Authorised Signatory
`;
    const parsed = parseBill(text);

    it("captures only the 2 real item rows (footer noise skipped)", () => {
      expect(parsed.lineItems.length).toBe(2);
      expect(parsed.lineItems[0].description).toBe("Widget A");
      expect(parsed.lineItems[1].description).toBe("Widget B");
    });
    it("does not capture Round Off, Authorised Signatory, or In Words as items", () => {
      for (const item of parsed.lineItems) {
        expect(item.description.toLowerCase()).not.toContain("round");
        expect(item.description.toLowerCase()).not.toContain("authorised");
        expect(item.description.toLowerCase()).not.toContain("words");
      }
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
