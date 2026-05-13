import { describe, it, expect } from "vitest";
import { parseCamt053 } from "@/lib/banking/parsers/camt053";

/**
 * Tests for BNK-G CAMT.053 parser. ISO 20022 XML.
 *
 * Direction comes from CdtDbtInd (CRDT/DBIT); reference from
 * AcctSvcrRef or EndToEndId; description concats Ustrd lines.
 */

const CAMT_SIMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
  <BkToCstmrStmt>
    <GrpHdr>
      <MsgId>MSG-001</MsgId>
      <CreDtTm>2026-05-01T08:00:00</CreDtTm>
    </GrpHdr>
    <Stmt>
      <Id>STMT-001</Id>
      <CreDtTm>2026-05-01T08:00:00</CreDtTm>
      <Acct>
        <Id><IBAN>DE89370400440532013000</IBAN></Id>
        <Ccy>EUR</Ccy>
      </Acct>
      <Ntry>
        <Amt Ccy="EUR">2400.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-04-15</Dt></BookgDt>
        <ValDt><Dt>2026-04-15</Dt></ValDt>
        <AcctSvcrRef>REF-AWS-001</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <Refs>
              <EndToEndId>E2E-AWS-001</EndToEndId>
            </Refs>
            <RmtInf>
              <Ustrd>AWS Cloud Services</Ustrd>
              <Ustrd>Monthly subscription</Ustrd>
            </RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">15000.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-04-20</Dt></BookgDt>
        <ValDt><Dt>2026-04-20</Dt></ValDt>
        <AcctSvcrRef>REF-ACME-001</AcctSvcrRef>
        <NtryDtls>
          <TxDtls>
            <RmtInf>
              <Ustrd>Acme Invoice Payment</Ustrd>
            </RmtInf>
          </TxDtls>
        </NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`;

describe("parseCamt053 — happy path", () => {
  it("parses a 2-entry statement end to end", () => {
    const r = parseCamt053(CAMT_SIMPLE);
    expect(r.errors).toEqual([]);
    expect(r.currency).toBe("EUR");
    expect(r.rows).toHaveLength(2);

    expect(r.rows[0]).toMatchObject({
      reference: "REF-AWS-001",
      amount: 2400,
      type: "DEBIT",
    });
    expect(r.rows[0].description).toContain("AWS Cloud Services");
    expect(r.rows[0].description).toContain("Monthly subscription");

    expect(r.rows[1]).toMatchObject({
      reference: "REF-ACME-001",
      amount: 15000,
      type: "CREDIT",
      description: "Acme Invoice Payment",
    });
  });
});

describe("parseCamt053 — namespace prefixes", () => {
  it("strips ns: prefixes (some files use them, e.g. <ns:Ntry>)", () => {
    const withPrefix = CAMT_SIMPLE
      .replace(/<Ntry>/g, "<ns:Ntry>")
      .replace(/<\/Ntry>/g, "</ns:Ntry>");
    const r = parseCamt053(withPrefix);
    // Should still parse — the parser is configured with removeNSPrefix.
    expect(r.rows).toHaveLength(2);
  });
});

describe("parseCamt053 — reference fallbacks", () => {
  it("falls back to EndToEndId when AcctSvcrRef is missing", () => {
    const xml = CAMT_SIMPLE.replace(
      "<AcctSvcrRef>REF-AWS-001</AcctSvcrRef>",
      ""
    );
    const r = parseCamt053(xml);
    expect(r.rows[0].reference).toBe("E2E-AWS-001");
  });
});

describe("parseCamt053 — currency from Amt @Ccy when account Ccy missing", () => {
  it("uses Amt @Ccy as fallback", () => {
    const xml = CAMT_SIMPLE.replace("<Ccy>EUR</Ccy>", "");
    const r = parseCamt053(xml);
    expect(r.currency).toBe("EUR");
  });
});

describe("parseCamt053 — error paths", () => {
  it("rejects an empty file", () => {
    expect(parseCamt053("").errors[0].message).toMatch(/empty/i);
  });

  it("rejects when <Document> root is missing", () => {
    const r = parseCamt053(`<?xml version="1.0"?>\n<NotADocument/>`);
    expect(r.errors[0].message).toMatch(/Document/);
  });

  it("rejects when <BkToCstmrStmt> is missing", () => {
    const r = parseCamt053(`<?xml version="1.0"?>\n<Document><Other/></Document>`);
    expect(r.errors[0].message).toMatch(/BkToCstmrStmt/);
  });

  it("flags a non-CRDT/DBIT CdtDbtInd value", () => {
    const xml = CAMT_SIMPLE.replace(
      "<CdtDbtInd>DBIT</CdtDbtInd>",
      "<CdtDbtInd>OTHR</CdtDbtInd>"
    );
    const r = parseCamt053(xml);
    expect(r.errors.some((e) => /CdtDbtInd/.test(e.message))).toBe(true);
  });
});
