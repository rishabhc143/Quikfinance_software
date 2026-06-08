import { describe, it, expect } from "vitest";
import { tallyPrimeParser } from "@/lib/migration/parsers/tally-prime";

/** Sprint 3 fixture covering the three new voucher types this PR
 *  adds (Purchase / Receipt / Payment). The original Sprint 1
 *  fixture (tally-prime-parser.test.ts) still covers Sales + Ledgers
 *  and now also confirms the "unsupported type" warning correctly
 *  classifies what's STILL unsupported (Journal, Credit Note, etc.). */
const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE>
          <LEDGER NAME="Office Supplies Ltd">
            <PARENT>Sundry Creditors</PARENT>
            <PARTYGSTIN>27XYZAB5678C1D9</PARTYGSTIN>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <LEDGER NAME="Acme Corp">
            <PARENT>Sundry Debtors</PARENT>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Purchase" ACTION="Create">
            <GUID>p-001</GUID>
            <DATE>20240601</DATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>BILL-501</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Office Supplies Ltd</PARTYLEDGERNAME>
            <PARTYGSTIN>27XYZAB5678C1D9</PARTYGSTIN>
            <NARRATION>Office consumables Q2</NARRATION>
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>A4 Paper Ream</STOCKITEMNAME>
              <RATE>500.00/box</RATE>
              <BILLEDQTY>20 box</BILLEDQTY>
              <AMOUNT>-10000.00</AMOUNT>
              <LEDGERENTRIES.LIST>
                <LEDGERNAME>CGST 9%</LEDGERNAME>
                <AMOUNT>900.00</AMOUNT>
              </LEDGERENTRIES.LIST>
              <LEDGERENTRIES.LIST>
                <LEDGERNAME>SGST 9%</LEDGERNAME>
                <AMOUNT>900.00</AMOUNT>
              </LEDGERENTRIES.LIST>
            </ALLINVENTORYENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Office Supplies Ltd</LEDGERNAME>
              <AMOUNT>11800.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Receipt" ACTION="Create">
            <GUID>r-001</GUID>
            <DATE>20240605</DATE>
            <VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
            <VOUCHERNUMBER>RCT-001</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Acme Corp</PARTYLEDGERNAME>
            <NARRATION>Payment received against INV-001</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Acme Corp</LEDGERNAME>
              <AMOUNT>-50000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>HDFC Bank</LEDGERNAME>
              <AMOUNT>50000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Payment" ACTION="Create">
            <GUID>pay-001</GUID>
            <DATE>20240610</DATE>
            <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
            <VOUCHERNUMBER>PMT-001</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Office Supplies Ltd</PARTYLEDGERNAME>
            <NARRATION>Payment against BILL-501</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Office Supplies Ltd</LEDGERNAME>
              <AMOUNT>11800.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>HDFC Bank</LEDGERNAME>
              <AMOUNT>-11800.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Journal" ACTION="Create">
            <GUID>j-001</GUID>
            <DATE>20240615</DATE>
            <VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
            <VOUCHERNUMBER>JRN-001</VOUCHERNUMBER>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

describe("tallyPrimeParser — Sprint 3 voucher types", () => {
  it("parses a Purchase voucher with GST, type='purchase'", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const bill = result.vouchers.find((v) => v.sourceVoucherNumber === "BILL-501");
    expect(bill).toBeDefined();
    expect(bill?.type).toBe("purchase");
    expect(bill?.partyRef?.displayName).toBe("Office Supplies Ltd");
    expect(bill?.partyRef?.gstin).toBe("27XYZAB5678C1D9");
    expect(bill?.totals.total).toBe(11800);
    expect(bill?.totals.subtotal).toBe(10000);
    expect(bill?.totals.tax).toBe(1800);
    expect(bill?.lines).toHaveLength(1);
    expect(bill?.lines[0].itemName).toBe("A4 Paper Ream");
  });

  it("normalises negative Tally amounts to positive on lines", async () => {
    // Tally signs purchase-side inventory amounts negative because
    // they're a credit on the bank side. Our canonical form is
    // always-positive amount + direction implied by type.
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const bill = result.vouchers.find((v) => v.sourceVoucherNumber === "BILL-501");
    expect(bill?.lines[0].amount).toBe(10000);
    expect(bill?.lines[0].amount).toBeGreaterThan(0);
  });

  it("parses a Receipt voucher, type='receipt'", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const rct = result.vouchers.find((v) => v.sourceVoucherNumber === "RCT-001");
    expect(rct).toBeDefined();
    expect(rct?.type).toBe("receipt");
    expect(rct?.partyRef?.displayName).toBe("Acme Corp");
    expect(rct?.totals.total).toBe(50000);
    expect(rct?.totals.tax).toBe(0); // Cash vouchers carry no tax
  });

  it("parses a Payment voucher, type='payment'", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const pmt = result.vouchers.find((v) => v.sourceVoucherNumber === "PMT-001");
    expect(pmt).toBeDefined();
    expect(pmt?.type).toBe("payment");
    expect(pmt?.partyRef?.displayName).toBe("Office Supplies Ltd");
    expect(pmt?.totals.total).toBe(11800);
  });

  it("Sprint 5 — Journal is now imported (was unsupported in Sprint 3)", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const j = result.vouchers.find((v) => v.type === "journal");
    expect(j).toBeDefined();
    expect(j?.sourceVoucherNumber).toBe("JRN-001");
  });

  it("extracts 4 vouchers total — Purchase + Receipt + Payment + Journal", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    // Sprint 3 fixture has 4 voucher types; Sprint 5 imports all of
    // them (Journal was previously unsupported, now first-class).
    expect(result.vouchers).toHaveLength(4);
    const types = result.vouchers.map((v) => v.type).sort();
    expect(types).toEqual(["journal", "payment", "purchase", "receipt"]);
  });

  it("each voucher uses Tally GUID as sourceGuid (not the fallback synthetic key)", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const guids = result.vouchers.map((v) => v.sourceGuid).sort();
    expect(guids).toEqual(["j-001", "p-001", "pay-001", "r-001"]);
  });

  it("Receipt without a matching party-ledger line falls back to largest amount", async () => {
    const xml = `<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
      <TALLYMESSAGE><VOUCHER VCHTYPE="Receipt"><GUID>r-x</GUID><DATE>20240601</DATE>
        <VOUCHERNUMBER>RCT-X</VOUCHERNUMBER>
        <ALLLEDGERENTRIES.LIST><LEDGERNAME>Some Ledger</LEDGERNAME><AMOUNT>1234.56</AMOUNT></ALLLEDGERENTRIES.LIST>
      </VOUCHER></TALLYMESSAGE>
    </REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
    const result = await tallyPrimeParser.parse(xml);
    expect(result.vouchers[0]?.totals.total).toBe(1234.56);
  });

  it("Purchase voucher with no party emits a warning + still records the data", async () => {
    const xml = `<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
      <TALLYMESSAGE><VOUCHER VCHTYPE="Purchase"><GUID>p-noparty</GUID><DATE>20240601</DATE>
        <VOUCHERNUMBER>BILL-NP</VOUCHERNUMBER>
        <ALLLEDGERENTRIES.LIST><LEDGERNAME>Some Expense</LEDGERNAME><AMOUNT>500</AMOUNT></ALLLEDGERENTRIES.LIST>
      </VOUCHER></TALLYMESSAGE>
    </REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
    const result = await tallyPrimeParser.parse(xml);
    expect(result.vouchers).toHaveLength(1);
    expect(result.vouchers[0].partyRef).toBeUndefined();
    expect(result.warnings.some((w) => w.code === "voucher_missing_party")).toBe(true);
  });
});
