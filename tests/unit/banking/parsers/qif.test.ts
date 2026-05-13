import { describe, it, expect } from "vitest";
import { parseQif } from "@/lib/banking/parsers/qif";

/**
 * Tests for BNK-G QIF parser.
 *
 * QIF is line-prefix text. Each transaction ends with `^`. Field codes:
 *   D=date, T=amount(signed), N=ref, P=payee, M=memo, C=cleared, L=cat
 */

const SIMPLE_QIF = `!Type:Bank
D04/15/2026
T-2400.00
N12345
PAWS Cloud Services
MMonthly subscription
^
D04/20/2026
T15000.00
PInvoice payment from Acme
^
`;

describe("parseQif — happy path", () => {
  it("parses a simple 2-transaction QIF", () => {
    const r = parseQif(SIMPLE_QIF);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({
      description: "AWS Cloud Services",
      reference: "12345",
      amount: 2400,
      type: "DEBIT",
    });
    expect(r.rows[1]).toMatchObject({
      description: "Invoice payment from Acme",
      amount: 15000,
      type: "CREDIT",
    });
  });

  it("treats negative T as DEBIT, positive as CREDIT", () => {
    const qif = `!Type:Bank\nD04/15/2026\nT-50\n^\nD04/16/2026\nT50\n^`;
    const r = parseQif(qif);
    expect(r.rows[0].type).toBe("DEBIT");
    expect(r.rows[1].type).toBe("CREDIT");
  });

  it("strips thousands separators and currency markers from amounts", () => {
    const qif = `!Type:Bank\nD04/15/2026\nT-2,400.50\n^`;
    const r = parseQif(qif);
    expect(r.rows[0].amount).toBe(2400.5);
  });

  it("falls back to memo when payee is missing", () => {
    const qif = `!Type:Bank\nD04/15/2026\nT-100\nMBank fee\n^`;
    const r = parseQif(qif);
    expect(r.rows[0].description).toBe("Bank fee");
  });

  it("tolerates a missing final ^ (some banks omit it)", () => {
    const qif = `!Type:Bank\nD04/15/2026\nT-100\nPVendor`;
    const r = parseQif(qif);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });

  it("accepts CCard (credit card) account type", () => {
    const qif = `!Type:CCard\nD04/15/2026\nT-100\n^`;
    const r = parseQif(qif);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
  });
});

describe("parseQif — errors", () => {
  it("rejects investment QIFs", () => {
    const qif = `!Type:Invst\nD04/15/2026\n^`;
    const r = parseQif(qif);
    expect(r.errors[0].message).toMatch(/investment/i);
    expect(r.rows).toEqual([]);
  });

  it("flags a block missing date", () => {
    const qif = `!Type:Bank\nT-100\n^`;
    const r = parseQif(qif);
    expect(r.errors[0].message).toMatch(/missing D/);
    expect(r.rows).toEqual([]);
  });

  it("flags a block missing amount", () => {
    const qif = `!Type:Bank\nD04/15/2026\n^`;
    const r = parseQif(qif);
    expect(r.errors[0].message).toMatch(/missing T/);
    expect(r.rows).toEqual([]);
  });

  it("flags an unparseable amount", () => {
    const qif = `!Type:Bank\nD04/15/2026\nTabc\n^`;
    const r = parseQif(qif);
    expect(r.errors[0].message).toMatch(/not a number/i);
  });

  it("rejects a file without !Type header", () => {
    const r = parseQif(`D04/15/2026\nT-100\n^`);
    expect(r.errors[0].message).toMatch(/!Type/);
  });

  it("rejects an empty file", () => {
    const r = parseQif("");
    expect(r.errors[0].message).toMatch(/empty/i);
  });
});
