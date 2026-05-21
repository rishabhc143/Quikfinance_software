import { describe, it, expect } from "vitest";
import { parseAxisStatement } from "@/lib/documents/parsers/axis";
import { parseSbiStatement } from "@/lib/documents/parsers/sbi";
import { parseKotakStatement } from "@/lib/documents/parsers/kotak";
import { parseIdfcStatement } from "@/lib/documents/parsers/idfc";
import { parseBankStatement } from "@/lib/documents/parsers";

const axisStatement = `
AXIS BANK
Statement of Account
Account Number: 91234567890
Statement Period: 01/04/2026 to 30/04/2026

Date Particulars Chq No Withdrawal Deposit Balance
01/04/2026 SAL CREDIT - 0.00 60,000.00 1,60,000.00
05/04/2026 ATM WDL - 5,000.00 0.00 1,55,000.00
10/04/2026 UPI NEFT - 2,500.00 0.00 1,52,500.00

Opening Balance 1,00,000.00
Closing Balance 1,52,500.00
`;

const sbiStatement = `
State Bank of India
Statement of Account
Account Number: 30005678901
Statement Period: 01-04-2026 to 30-04-2026

Txn Date Value Date Description Ref No Debit Credit Balance
01-04-2026 01-04-2026 SAL NEFT REF1 0.00 75,000.00 2,00,000.00
05-04-2026 05-04-2026 ATM CASH ATM1 6,000.00 0.00 1,94,000.00
12-04-2026 12-04-2026 RTGS PAYMENT RTGS1 25,000.00 0.00 1,69,000.00

Opening Balance 1,25,000.00
Closing Balance 1,69,000.00
`;

const kotakStatement = `
Kotak Mahindra Bank
Statement of Account
Account Number: 50220011223344
Statement Period: 01/04/2026 to 30/04/2026

Date Description Chq No Withdrawal Deposit Balance
01/04/2026 SAL CREDIT - 0.00 40,000.00 90,000.00
03/04/2026 EMI DEBIT EMI001 8,500.00 0.00 81,500.00

Opening Balance 50,000.00
Closing Balance 81,500.00
`;

const idfcStatement = `
IDFC FIRST Bank
Statement of Account
Account Number: 10001234567
Statement Period: 01/04/2026 to 30/04/2026

Date Narration Withdrawal Deposit Balance
01/04/2026 CREDIT INTEREST 0.00 250.00 25,250.00
07/04/2026 BILL PAYMENT 1,200.00 0.00 24,050.00

Opening Balance 25,000.00
Closing Balance 24,050.00
`;

describe("documents/parsers — Axis", () => {
  const r = parseAxisStatement(axisStatement);
  it("tags bank as AXIS", () => expect(r.bank).toBe("AXIS"));
  it("parses 3 rows", () => expect(r.rows).toHaveLength(3));
  it("captures opening + closing balances", () => {
    expect(r.openingBalance).toBe(100000);
    expect(r.closingBalance).toBe(152500);
  });
  it("first row is salary credit", () => {
    expect(r.rows[0].credit).toBe(60000);
    expect(r.rows[0].debit).toBeUndefined();
  });
  it("ATM withdrawal is a debit", () => {
    expect(r.rows[1].debit).toBe(5000);
    expect(r.rows[1].credit).toBeUndefined();
  });
});

describe("documents/parsers — SBI", () => {
  const r = parseSbiStatement(sbiStatement);
  it("tags bank as SBI", () => expect(r.bank).toBe("SBI"));
  it("parses at least 3 rows", () => expect(r.rows.length).toBeGreaterThanOrEqual(3));
  it("handles dd-MM-yyyy date format", () => {
    expect(r.rows[0].date).toBe("2026-04-01");
  });
  it("captures opening + closing balances", () => {
    expect(r.openingBalance).toBe(125000);
    expect(r.closingBalance).toBe(169000);
  });
});

describe("documents/parsers — Kotak", () => {
  const r = parseKotakStatement(kotakStatement);
  it("tags bank as KOTAK", () => expect(r.bank).toBe("KOTAK"));
  it("parses 2 rows", () => expect(r.rows).toHaveLength(2));
  it("EMI debit is a debit", () => {
    expect(r.rows[1].debit).toBe(8500);
  });
});

describe("documents/parsers — IDFC", () => {
  const r = parseIdfcStatement(idfcStatement);
  it("tags bank as IDFC", () => expect(r.bank).toBe("IDFC"));
  it("parses 2 rows", () => expect(r.rows).toHaveLength(2));
  it("interest credit detected as credit", () => {
    expect(r.rows[0].credit).toBe(250);
  });
});

describe("documents/parsers — parseBankStatement router", () => {
  it("routes Axis to Axis parser", () => {
    const r = parseBankStatement(axisStatement);
    expect(r?.bank).toBe("AXIS");
    expect(r?.rows.length).toBeGreaterThan(0);
  });
  it("routes SBI to SBI parser", () => {
    const r = parseBankStatement(sbiStatement);
    expect(r?.bank).toBe("SBI");
    expect(r?.rows.length).toBeGreaterThan(0);
  });
  it("routes Kotak to Kotak parser", () => {
    const r = parseBankStatement(kotakStatement);
    expect(r?.bank).toBe("KOTAK");
    expect(r?.rows.length).toBeGreaterThan(0);
  });
  it("routes IDFC to IDFC parser", () => {
    const r = parseBankStatement(idfcStatement);
    expect(r?.bank).toBe("IDFC");
    expect(r?.rows.length).toBeGreaterThan(0);
  });
  it("returns null for unknown bank text", () => {
    const r = parseBankStatement(
      "Random text with no Indian bank name or statement structure"
    );
    expect(r).toBeNull();
  });
});
