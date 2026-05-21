import { describe, it, expect } from "vitest";
import { classifyDocument } from "@/lib/documents/document-classifier";

describe("documents/document-classifier", () => {
  describe("BANK_STATEMENT detection", () => {
    it("detects a clear HDFC bank statement", () => {
      const text = `
HDFC BANK
Statement of Account
Account Number: 50100123456789
A/C No: 50100123456789
Statement Period: 01/04/2026 to 30/04/2026

Opening Balance: 25,000.00
Closing Balance: 32,450.00

Transaction Date  Value Date  Description  Withdrawal  Deposit  Balance
01/04/2026  01/04/2026  Salary Credit  -  50,000.00  75,000.00
05/04/2026  05/04/2026  ATM Withdrawal  5,000.00  -  70,000.00

IFSC: HDFC0001234
`;
      const result = classifyDocument(text);
      expect(result.type).toBe("BANK_STATEMENT");
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it("detects an ICICI bank statement", () => {
      const text = `
ICICI BANK
Account Statement
Available Balance: 1,25,000.00
Opening Balance / Closing Balance
IFSC Code: ICIC0001234
Customer Name: Example Pvt Ltd
`;
      const result = classifyDocument(text);
      expect(result.type).toBe("BANK_STATEMENT");
    });

    it("detects a State Bank of India statement", () => {
      const text = `
State Bank of India
Statement of Account
A/C No: 30005678901
Transaction Date  Value Date  Description  Withdrawal  Deposit
`;
      const result = classifyDocument(text);
      expect(result.type).toBe("BANK_STATEMENT");
    });

    it("uses just IFSC + statement phrases when bank name is absent", () => {
      const text = `
Statement of Account
Account Number: 1234567890
Opening Balance: 10000
Closing Balance: 15000
IFSC: XYZB0001234
`;
      const result = classifyDocument(text);
      expect(result.type).toBe("BANK_STATEMENT");
    });
  });

  describe("INVOICE / BILL detection", () => {
    it("detects a Tax Invoice with GSTIN", () => {
      const text = `
TAX INVOICE
Invoice Number: INV-2026-001
Invoice Date: 15/05/2026
GSTIN: 29ABCDE1234F1Z5
Bill To: Customer Pvt Ltd
Place of Supply: Karnataka
HSN/SAC: 9983
CGST: 9,000
SGST: 9,000
Grand Total: 1,18,000
`;
      const result = classifyDocument(text);
      expect(result.type).toBe("INVOICE");
    });

    it("detects a Bill of Supply / vendor bill", () => {
      const text = `
Bill of Supply
Bill No: BOS-001
Vendor: ABC Suppliers
Payment Terms: Net 30
Due Date: 30/05/2026
GSTIN: 29ABCDE1234F1Z5
`;
      const result = classifyDocument(text);
      // Either BILL or INVOICE acceptable here since both phrases hit;
      // the classifier picks the higher score. Both indicate vendor-doc.
      expect(["BILL", "INVOICE"]).toContain(result.type);
    });
  });

  describe("RECEIPT detection", () => {
    it("detects a payment receipt", () => {
      const text = `
Payment Receipt
Receipt Number: RCPT-001
Amount Paid: 5,000
Paid By: John Doe
Thank you for your payment
Date: 15 May 2026
`;
      const result = classifyDocument(text);
      expect(result.type).toBe("RECEIPT");
    });
  });

  describe("CONTRACT detection", () => {
    it("detects a contract / agreement", () => {
      const text = `
SERVICE AGREEMENT

This Agreement is entered into between the following Parties:
Effective Date: 01 May 2026

WHEREAS, the parties have agreed to the following Terms and Conditions
hereinafter set forth...
`;
      const result = classifyDocument(text);
      expect(result.type).toBe("CONTRACT");
    });
  });

  describe("UNKNOWN fallback", () => {
    it("returns UNKNOWN for empty / null / very short text", () => {
      expect(classifyDocument(null).type).toBe("UNKNOWN");
      expect(classifyDocument(undefined).type).toBe("UNKNOWN");
      expect(classifyDocument("").type).toBe("UNKNOWN");
      expect(classifyDocument("hi").type).toBe("UNKNOWN");
    });

    it("returns UNKNOWN for arbitrary text with no cues", () => {
      const text = `
The quick brown fox jumps over the lazy dog.
This is a sample paragraph that doesn't match any rules.
Another line of plain text without any banking, billing, or contract cues.
`;
      const result = classifyDocument(text);
      expect(result.type).toBe("UNKNOWN");
    });

    it("returns UNKNOWN when score is below threshold (single weak cue)", () => {
      // Just "Receipt" mentioned once in plain text shouldn't beat
      // the threshold without other cues — actually one match × 0.4 = 0.4,
      // below 0.5 — should fall back to UNKNOWN.
      const text =
        "Lorem ipsum dolor sit amet. The word Receipt appears here.";
      const result = classifyDocument(text);
      expect(result.type).toBe("UNKNOWN");
    });
  });

  describe("confidence + matchedCues", () => {
    it("returns a confidence between 0 and 1", () => {
      const text = `HDFC BANK Statement of Account Opening Balance Closing Balance IFSC HDFC0001234`;
      const result = classifyDocument(text);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it("returns the matched cues so the UI can explain the choice", () => {
      const text = `HDFC BANK Statement of Account Opening Balance Closing Balance`;
      const result = classifyDocument(text);
      expect(result.matchedCues.length).toBeGreaterThan(0);
      expect(
        result.matchedCues.some((c) =>
          c.toLowerCase().includes("opening balance")
        )
      ).toBe(true);
    });

    it("returns empty matchedCues for UNKNOWN", () => {
      const result = classifyDocument("nothing classifiable here");
      expect(result.type).toBe("UNKNOWN");
      expect(result.matchedCues).toEqual([]);
    });
  });
});
