import { describe, it, expect } from "vitest";
import { tallyPrimeParser } from "@/lib/migration/parsers/tally-prime";

/** Sprint 5 fixture — Journal, Credit Note, Debit Note, Contra
 *  voucher types. The dispatcher used to warn on all of these
 *  as "unsupported"; Sprint 5 brings them in as first-class
 *  CompanionVoucher rows. */
const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE>
          <LEDGER NAME="Acme Corp">
            <PARENT>Sundry Debtors</PARENT>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Credit Note" ACTION="Create">
            <GUID>cn-001</GUID>
            <DATE>20240615</DATE>
            <VOUCHERTYPENAME>Credit Note</VOUCHERTYPENAME>
            <VOUCHERNUMBER>CN-001</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Acme Corp</PARTYLEDGERNAME>
            <NARRATION>Refund for INV-001</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Acme Corp</LEDGERNAME>
              <AMOUNT>5000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Sales Account</LEDGERNAME>
              <AMOUNT>-5000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Debit Note" ACTION="Create">
            <GUID>dn-001</GUID>
            <DATE>20240620</DATE>
            <VOUCHERTYPENAME>Debit Note</VOUCHERTYPENAME>
            <VOUCHERNUMBER>DN-001</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Office Supplies Ltd</PARTYLEDGERNAME>
            <NARRATION>Return of defective stock</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Office Supplies Ltd</LEDGERNAME>
              <AMOUNT>-2000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Purchase Account</LEDGERNAME>
              <AMOUNT>2000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Contra" ACTION="Create">
            <GUID>ct-001</GUID>
            <DATE>20240625</DATE>
            <VOUCHERTYPENAME>Contra</VOUCHERTYPENAME>
            <VOUCHERNUMBER>CT-001</VOUCHERNUMBER>
            <NARRATION>Cash deposit to bank</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>HDFC Bank</LEDGERNAME>
              <AMOUNT>10000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Cash-in-Hand</LEDGERNAME>
              <AMOUNT>-10000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Journal" ACTION="Create">
            <GUID>j-001</GUID>
            <DATE>20240630</DATE>
            <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
            <VOUCHERNUMBER>JRN-001</VOUCHERNUMBER>
            <NARRATION>Month-end depreciation</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Depreciation Expense</LEDGERNAME>
              <AMOUNT>15000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Accumulated Depreciation</LEDGERNAME>
              <AMOUNT>-15000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Stock Journal" ACTION="Create">
            <GUID>sj-001</GUID>
            <DATE>20240701</DATE>
            <VOUCHERTYPENAME>Stock Journal</VOUCHERTYPENAME>
            <VOUCHERNUMBER>SJ-001</VOUCHERNUMBER>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

describe("tallyPrimeParser — Sprint 5 voucher types", () => {
  it("parses a Credit Note as type='credit_note'", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const cn = result.vouchers.find((v) => v.sourceVoucherNumber === "CN-001");
    expect(cn).toBeDefined();
    expect(cn?.type).toBe("credit_note");
    expect(cn?.partyRef?.displayName).toBe("Acme Corp");
    expect(cn?.totals.total).toBe(5000);
  });

  it("parses a Debit Note as type='debit_note'", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const dn = result.vouchers.find((v) => v.sourceVoucherNumber === "DN-001");
    expect(dn).toBeDefined();
    expect(dn?.type).toBe("debit_note");
    expect(dn?.partyRef?.displayName).toBe("Office Supplies Ltd");
    expect(dn?.totals.total).toBe(2000);
  });

  it("parses a Contra voucher as type='contra' with no partyRef", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const ct = result.vouchers.find((v) => v.sourceVoucherNumber === "CT-001");
    expect(ct).toBeDefined();
    expect(ct?.type).toBe("contra");
    // Contras have no party — they're internal cash movements.
    expect(ct?.partyRef).toBeUndefined();
    expect(ct?.totals.total).toBe(10000);
  });

  it("parses a Journal voucher as type='journal'", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const j = result.vouchers.find((v) => v.sourceVoucherNumber === "JRN-001");
    expect(j).toBeDefined();
    expect(j?.type).toBe("journal");
    // Journal total = sum of debit side (positive amounts) only,
    // since debits == credits in a balanced journal.
    expect(j?.totals.total).toBe(15000);
    expect(j?.lines).toHaveLength(2);
  });

  it("still warns about TRULY unsupported types (Stock Journal)", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const w = result.warnings.find((w) => w.code === "voucher_type_unsupported_v1");
    expect(w).toBeDefined();
    expect(w?.message).toMatch(/stock journal/i);
  });

  it("does NOT warn about Journal/CN/DN/Contra anymore", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const w = result.warnings.find(
      (w) =>
        w.code === "voucher_type_unsupported_v1" &&
        /(journal|credit note|debit note|contra)/i.test(w.message) &&
        !/stock journal/i.test(w.message)
    );
    expect(w).toBeUndefined();
  });

  it("extracts 4 vouchers (CN + DN + Contra + Journal), skipping Stock Journal", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    expect(result.vouchers).toHaveLength(4);
    const types = result.vouchers.map((v) => v.type).sort();
    expect(types).toEqual(["contra", "credit_note", "debit_note", "journal"]);
  });

  it("accepts both 'Credit Note' (with space) and 'credit_note' VCHTYPE spellings", async () => {
    const xml = `<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
      <TALLYMESSAGE><VOUCHER VCHTYPE="credit_note"><GUID>cn-x</GUID><DATE>20240601</DATE>
        <VOUCHERNUMBER>CN-X</VOUCHERNUMBER>
        <PARTYLEDGERNAME>X</PARTYLEDGERNAME>
        <ALLLEDGERENTRIES.LIST><LEDGERNAME>X</LEDGERNAME><AMOUNT>100</AMOUNT></ALLLEDGERENTRIES.LIST>
      </VOUCHER></TALLYMESSAGE>
    </REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
    const result = await tallyPrimeParser.parse(xml);
    expect(result.vouchers).toHaveLength(1);
    expect(result.vouchers[0].type).toBe("credit_note");
  });

  it("Journal voucher with no party is fine (no missing-party warning)", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    // The Journal voucher above has no PARTYLEDGERNAME — that's
    // legal and should NOT trigger the "missing party" warning
    // (which is for Sales/Purchase/Cash vouchers where party
    // is required).
    const w = result.warnings.find(
      (w) =>
        w.code === "voucher_missing_party" && w.message.includes("JRN-001")
    );
    expect(w).toBeUndefined();
  });
});
