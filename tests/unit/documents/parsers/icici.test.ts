import { describe, it, expect } from "vitest";
import { parseIciciStatement } from "@/lib/documents/parsers/icici";

describe("documents/parsers/icici", () => {
  const sampleStatement = `
ICICI Bank
Account Statement
Account Number: 1234567890
Statement Period: 01/04/2026 to 30/04/2026

S.No Value Date Transaction Date Cheque Number Transaction Remarks Withdrawal Deposit Balance
1 01/04/2026 01/04/2026 - SALARY - 50,000.00 1,25,000.00
2 05/04/2026 05/04/2026 - ATM WDL 5,000.00 - 1,20,000.00
3 10/04/2026 10/04/2026 CHQ123 PAYMENT 12,500.00 - 1,07,500.00
4 15/04/2026 15/04/2026 - INTEREST CREDIT - 1,200.00 1,08,700.00

Opening Balance 75,000.00
Closing Balance 1,08,700.00
`;

  const parsed = parseIciciStatement(sampleStatement);

  it("identifies bank as ICICI", () => {
    expect(parsed.bank).toBe("ICICI");
  });

  it("captures account number", () => {
    expect(parsed.accountNumber).toBe("1234567890");
  });

  it("captures statement period", () => {
    expect(parsed.period).toEqual({
      from: "2026-04-01",
      to: "2026-04-30",
    });
  });

  it("captures opening + closing balances", () => {
    expect(parsed.openingBalance).toBe(75000);
    expect(parsed.closingBalance).toBe(108700);
  });

  it("parses 4 transaction rows", () => {
    expect(parsed.rows).toHaveLength(4);
  });

  it("row 1: salary credit", () => {
    const r = parsed.rows[0];
    expect(r.date).toBe("2026-04-01");
    expect(r.credit).toBe(50000);
    expect(r.debit).toBeUndefined();
    expect(r.balance).toBe(125000);
  });

  it("row 2: ATM withdrawal (debit)", () => {
    const r = parsed.rows[1];
    expect(r.date).toBe("2026-04-05");
    expect(r.debit).toBe(5000);
    expect(r.credit).toBeUndefined();
    expect(r.balance).toBe(120000);
  });

  it("row 3: payment with cheque number (debit)", () => {
    const r = parsed.rows[2];
    expect(r.date).toBe("2026-04-10");
    expect(r.debit).toBe(12500);
    expect(r.balance).toBe(107500);
  });

  it("row 4: interest credit", () => {
    const r = parsed.rows[3];
    expect(r.date).toBe("2026-04-15");
    expect(r.credit).toBe(1200);
    expect(r.balance).toBe(108700);
  });

  it("returns empty rows array for non-statement text", () => {
    const result = parseIciciStatement("random text no dates");
    expect(result.rows).toEqual([]);
    expect(result.bank).toBe("ICICI");
  });

  it("handles 'Statement from X to Y' phrasing", () => {
    const text = `
ICICI Bank
Statement from 01/04/2026 to 30/04/2026
1 01/04/2026 01/04/2026 - SAL - 1000 1000
`;
    const result = parseIciciStatement(text);
    expect(result.period).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });
});
