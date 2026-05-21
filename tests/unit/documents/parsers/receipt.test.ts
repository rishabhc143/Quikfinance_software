import { describe, it, expect } from "vitest";
import { parseReceipt } from "@/lib/documents/parsers/receipt";

describe("documents/parsers/receipt", () => {
  it("parses a cafe receipt", () => {
    const text = `
Cafe Quik
12 MG Road, Bengaluru
Date: 15/05/2026

Item Amount
Coffee 150.00
Sandwich 250.00

Total 400.00
Paid by Card
Thank you for your visit!
`;
    const parsed = parseReceipt(text);
    expect(parsed.vendorName?.toLowerCase()).toContain("cafe quik");
    expect(parsed.date).toBe("2026-05-15");
    expect(parsed.total).toBe(400);
    expect(parsed.paidVia).toBe("Card");
  });

  it("parses an online order receipt with UPI payment", () => {
    const text = `
Payment Receipt
Quik Mart
Order Date: 20 May 2026
Amount Paid: ₹1,250.00
Paid via UPI
`;
    const parsed = parseReceipt(text);
    expect(parsed.total).toBe(1250);
    expect(parsed.date).toBe("2026-05-20");
    expect(parsed.paidVia).toBe("UPI");
    expect(parsed.vendorName?.toLowerCase()).toContain("quik mart");
  });

  it("falls back to the largest ₹ amount when no Total label", () => {
    const text = `
Quik Stationery
01/05/2026
₹75.00 pen
₹500.00 notebook
₹575.00 paid
`;
    const parsed = parseReceipt(text);
    // Largest ₹ token = 575 (the "paid" line). Or "Total" / "paid"
    // label may capture 575 too. Either way the value should be 575.
    expect(parsed.total).toBe(575);
  });

  it("captures Cash payment mode", () => {
    const text = `
Receipt
Quik Hardware
Date: 10/05/2026
Total 200.00
Paid by Cash
`;
    const parsed = parseReceipt(text);
    expect(parsed.paidVia).toBe("Cash");
  });

  it("returns undefined for fields not detected", () => {
    const text = "Just some text without a receipt structure";
    const parsed = parseReceipt(text);
    expect(parsed.total).toBeUndefined();
    expect(parsed.date).toBeUndefined();
  });

  it("recognises NEFT / RTGS / Cheque modes", () => {
    expect(parseReceipt("Paid via NEFT Total 1000").paidVia).toBe("NEFT");
    expect(parseReceipt("Paid via RTGS Total 5000").paidVia).toBe("RTGS");
    expect(parseReceipt("Paid by Cheque Total 750").paidVia).toBe("Cheque");
  });
});
