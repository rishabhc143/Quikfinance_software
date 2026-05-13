import { describe, it, expect } from "vitest";
import { parseOfx } from "@/lib/banking/parsers/ofx";

/**
 * Tests for BNK-G OFX parser.
 *
 * Both legacy (SGML, 1.x) and modern (XML, 2.x) shapes need to work.
 * The 1.x flavour has unclosed leaf tags — the parser normalises
 * them to XML before delegating to fast-xml-parser.
 */

const OFX_1X = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<CURDEF>INR
<BANKACCTFROM>
<BANKID>HDFC0001
<ACCTID>1234567890
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260401
<DTEND>20260430
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260415000000
<TRNAMT>-2400.00
<FITID>20260415-001
<NAME>AWS Cloud Services
<MEMO>Monthly subscription
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260420000000
<TRNAMT>15000.00
<FITID>20260420-001
<NAME>Acme Invoice Payment
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

const OFX_2X = `<?xml version="1.0" encoding="UTF-8"?>
<?OFX OFXHEADER="200" VERSION="200" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <STMTRS>
        <CURDEF>USD</CURDEF>
        <BANKACCTFROM>
          <BANKID>123456789</BANKID>
          <ACCTID>987654321</ACCTID>
          <ACCTTYPE>CHECKING</ACCTTYPE>
        </BANKACCTFROM>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260415</DTPOSTED>
            <TRNAMT>-99.99</TRNAMT>
            <FITID>abc-001</FITID>
            <NAME>Stripe Fee</NAME>
          </STMTTRN>
        </BANKTRANLIST>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>`;

describe("parseOfx — OFX 1.x SGML", () => {
  it("parses a 2-transaction 1.x file end to end", () => {
    const r = parseOfx(OFX_1X);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(2);
    expect(r.currency).toBe("INR");
    expect(r.rows[0]).toMatchObject({
      description: "AWS Cloud Services",
      reference: "20260415-001",
      amount: 2400,
      type: "DEBIT",
    });
    expect(r.rows[1]).toMatchObject({
      description: "Acme Invoice Payment",
      reference: "20260420-001",
      amount: 15000,
      type: "CREDIT",
    });
  });
});

describe("parseOfx — OFX 2.x XML", () => {
  it("parses a 1-transaction 2.x file end to end", () => {
    const r = parseOfx(OFX_2X);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.currency).toBe("USD");
    expect(r.rows[0]).toMatchObject({
      description: "Stripe Fee",
      reference: "abc-001",
      amount: 99.99,
      type: "DEBIT",
    });
  });
});

describe("parseOfx — credit card statements (CCSTMTRS)", () => {
  it("walks credit-card statements via CREDITCARDMSGSRSV1", () => {
    const cc = `<?xml version="1.0"?>
<OFX>
  <CREDITCARDMSGSRSV1>
    <CCSTMTTRNRS>
      <CCSTMTRS>
        <CURDEF>USD</CURDEF>
        <BANKTRANLIST>
          <STMTTRN>
            <TRNTYPE>DEBIT</TRNTYPE>
            <DTPOSTED>20260101</DTPOSTED>
            <TRNAMT>-50</TRNAMT>
            <FITID>cc-001</FITID>
            <NAME>Lunch</NAME>
          </STMTTRN>
        </BANKTRANLIST>
      </CCSTMTRS>
    </CCSTMTTRNRS>
  </CREDITCARDMSGSRSV1>
</OFX>`;
    const r = parseOfx(cc);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].reference).toBe("cc-001");
  });
});

describe("parseOfx — direction + date variants", () => {
  it("treats negative TRNAMT as DEBIT, positive as CREDIT", () => {
    const r = parseOfx(OFX_1X);
    expect(r.rows[0].type).toBe("DEBIT");
    expect(r.rows[1].type).toBe("CREDIT");
  });

  it("accepts DTPOSTED with timezone block", () => {
    const ofx = `<?xml version="1.0"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD</CURDEF>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260415120000.000[-5:EST]</DTPOSTED>
<TRNAMT>-10</TRNAMT><FITID>tz-001</FITID><NAME>x</NAME></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const r = parseOfx(ofx);
    expect(r.errors).toEqual([]);
    expect(r.rows[0].date.toISOString()).toMatch(/^2026-04-15T12:00:00/);
  });

  it("falls back to MEMO when NAME is missing", () => {
    const ofx = `<?xml version="1.0"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD</CURDEF>
<BANKTRANLIST><STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<DTPOSTED>20260415</DTPOSTED>
<TRNAMT>-10</TRNAMT><FITID>m-001</FITID><MEMO>Coffee</MEMO></STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const r = parseOfx(ofx);
    expect(r.rows[0].description).toBe("Coffee");
  });
});

describe("parseOfx — error paths", () => {
  it("rejects an empty file", () => {
    const r = parseOfx("");
    expect(r.errors[0].message).toMatch(/empty/i);
  });

  it("rejects a file with no <OFX> root", () => {
    const r = parseOfx("<NotOFX></NotOFX>");
    expect(r.errors[0].message).toMatch(/missing <OFX>/i);
  });

  it("flags missing DTPOSTED on individual rows", () => {
    const ofx = `<?xml version="1.0"?>
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>USD</CURDEF>
<BANKTRANLIST><STMTTRN>
<TRNTYPE>DEBIT</TRNTYPE>
<TRNAMT>-10</TRNAMT><FITID>x</FITID><NAME>x</NAME></STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const r = parseOfx(ofx);
    expect(r.errors[0].message).toMatch(/DTPOSTED/);
  });
});
