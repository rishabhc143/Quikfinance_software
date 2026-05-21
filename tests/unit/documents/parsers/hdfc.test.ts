import { describe, it, expect } from "vitest";
import { parseHdfcStatement } from "@/lib/documents/parsers/hdfc";
import {
  parseInrAmount,
  parseInrDate,
} from "@/lib/documents/parsers/bank-statement-types";

describe("documents/parsers/hdfc — helpers", () => {
  describe("parseInrAmount", () => {
    it("parses plain numbers", () => {
      expect(parseInrAmount("1234.56")).toBe(1234.56);
    });
    it("parses Indian lakh-grouped numbers", () => {
      expect(parseInrAmount("1,23,456.78")).toBeCloseTo(123456.78);
      expect(parseInrAmount("12,34,567.89")).toBeCloseTo(1234567.89);
    });
    it("parses Western thousand-grouped numbers", () => {
      expect(parseInrAmount("123,456.78")).toBeCloseTo(123456.78);
    });
    it("parses parenthesised negatives", () => {
      expect(parseInrAmount("(1,234.56)")).toBeCloseTo(-1234.56);
    });
    it("strips Dr/Cr suffix and case-insensitively", () => {
      expect(parseInrAmount("1,234.56 Dr")).toBeCloseTo(1234.56);
      expect(parseInrAmount("1,234.56 CR")).toBeCloseTo(1234.56);
      expect(parseInrAmount("100 cr")).toBe(100);
    });
    it("returns NaN for invalid input", () => {
      expect(Number.isNaN(parseInrAmount("abc"))).toBe(true);
      expect(Number.isNaN(parseInrAmount(""))).toBe(true);
      expect(Number.isNaN(parseInrAmount(null))).toBe(true);
      expect(Number.isNaN(parseInrAmount(undefined))).toBe(true);
    });
  });

  describe("parseInrDate", () => {
    it("parses dd/MM/yyyy", () => {
      expect(parseInrDate("01/04/2026")).toBe("2026-04-01");
      expect(parseInrDate("31/12/2026")).toBe("2026-12-31");
    });
    it("parses dd-MM-yyyy", () => {
      expect(parseInrDate("01-04-2026")).toBe("2026-04-01");
    });
    it("parses dd MMM yyyy", () => {
      expect(parseInrDate("01 Apr 2026")).toBe("2026-04-01");
      expect(parseInrDate("31 December 2026")).toBe("2026-12-31");
    });
    it("parses yyyy-MM-dd already-ISO format", () => {
      expect(parseInrDate("2026-04-01")).toBe("2026-04-01");
    });
    it("expands 2-digit years (>=70 → 19xx, else 20xx)", () => {
      expect(parseInrDate("01/04/26")).toBe("2026-04-01");
      expect(parseInrDate("01/04/99")).toBe("1999-04-01");
    });
    it("returns null for invalid dates", () => {
      expect(parseInrDate("32/13/2026")).toBeNull();
      expect(parseInrDate("not a date")).toBeNull();
      expect(parseInrDate("")).toBeNull();
      expect(parseInrDate(null)).toBeNull();
    });
  });
});

describe("documents/parsers/hdfc — statement parser", () => {
  const sampleStatement = `
HDFC BANK
Statement of Account
Account Number: 50100123456789
Statement Period: 01/04/2026 to 30/04/2026

Date Narration Chq./Ref.No. Value Dt Withdrawal Amt. Deposit Amt. Closing Balance
01/04/2026 SALARY-NEFT REF12345 01/04/2026 0.00 50,000.00 1,25,000.00
05/04/2026 ATM WDL ATM999 05/04/2026 5,000.00 0.00 1,20,000.00
10/04/2026 UPI-RZRPAY UPI001 10/04/2026 1,500.00 0.00 1,18,500.00

OPENING BALANCE 75,000.00
CLOSING BALANCE 1,18,500.00
`;

  const parsed = parseHdfcStatement(sampleStatement);

  it("identifies the bank as HDFC", () => {
    expect(parsed.bank).toBe("HDFC");
  });

  it("captures the account number", () => {
    expect(parsed.accountNumber).toBe("50100123456789");
  });

  it("captures the statement period", () => {
    expect(parsed.period).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });

  it("captures opening + closing balances", () => {
    expect(parsed.openingBalance).toBe(75000);
    expect(parsed.closingBalance).toBe(118500);
  });

  it("parses 3 transaction rows", () => {
    expect(parsed.rows).toHaveLength(3);
  });

  it("first row is a credit (salary deposit)", () => {
    const row = parsed.rows[0];
    expect(row.date).toBe("2026-04-01");
    expect(row.credit).toBe(50000);
    expect(row.debit).toBeUndefined();
    expect(row.balance).toBe(125000);
    expect(row.description.toLowerCase()).toContain("salary");
  });

  it("second row is a debit (ATM withdrawal)", () => {
    const row = parsed.rows[1];
    expect(row.date).toBe("2026-04-05");
    expect(row.debit).toBe(5000);
    expect(row.credit).toBeUndefined();
    expect(row.balance).toBe(120000);
    expect(row.description.toUpperCase()).toContain("ATM");
  });

  it("third row is a debit (UPI)", () => {
    const row = parsed.rows[2];
    expect(row.date).toBe("2026-04-10");
    expect(row.debit).toBe(1500);
    expect(row.balance).toBe(118500);
  });

  it("returns empty rows array for non-HDFC text", () => {
    const result = parseHdfcStatement("Random text without dates or amounts.");
    expect(result.rows).toEqual([]);
    expect(result.bank).toBe("HDFC"); // tag stays — caller picks parser
  });

  it("tolerates missing balance column (2-amount layout) using Dr/Cr suffix", () => {
    const text = `
HDFC BANK
Statement of Account
Date Narration Amount Balance
01/04/2026 SAL 50,000.00 Cr 1,25,000.00
05/04/2026 ATM 5,000.00 Dr 1,20,000.00
`;
    const result = parseHdfcStatement(text);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].credit).toBe(50000);
    expect(result.rows[1].debit).toBe(5000);
  });
});
