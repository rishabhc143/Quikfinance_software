import { describe, it, expect } from "vitest";
import { tallyPrimeParser } from "@/lib/migration/parsers/tally-prime";

/** Minimal Tally Prime envelope covering the v1 happy path:
 *  3 ledgers (1 customer, 1 vendor, 1 sales account) and 2 sales
 *  vouchers (one with inventory entries + GST, one service-only
 *  with no inventory). The fixture deliberately exercises:
 *    - PARTYGSTIN field
 *    - State details
 *    - CGST + SGST sub-ledgers under inventory entries
 *    - A voucher with no PARTYLEDGERNAME (the "missing party"
 *      warning path)
 *    - An unsupported voucher type (Receipt) to confirm v1 skips
 *      it gracefully with a warning. */
const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDATA>
        <TALLYMESSAGE>
          <LEDGER NAME="Acme Corp">
            <PARENT>Sundry Debtors</PARENT>
            <PARTYGSTIN>29ABCDE1234F1Z5</PARTYGSTIN>
            <STATEDETAILS.LIST><STATENAME>Karnataka</STATENAME></STATEDETAILS.LIST>
            <LEDGERPHONE>+91-9876543210</LEDGERPHONE>
            <EMAIL>contact@acme.example</EMAIL>
            <OPENINGBALANCE>-150000.00</OPENINGBALANCE>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <LEDGER NAME="Office Supplies Ltd">
            <PARENT>Sundry Creditors</PARENT>
            <PARTYGSTIN>27XYZAB5678C1D9</PARTYGSTIN>
            <OPENINGBALANCE>50000.00</OPENINGBALANCE>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <LEDGER NAME="Sales Account">
            <PARENT>Sales Accounts</PARENT>
          </LEDGER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <GUID>abc-vch-001</GUID>
            <DATE>20240515</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>INV-001</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Acme Corp</PARTYLEDGERNAME>
            <PARTYGSTIN>29ABCDE1234F1Z5</PARTYGSTIN>
            <PLACEOFSUPPLY>Karnataka</PLACEOFSUPPLY>
            <NARRATION>Q1 FY26 consulting services</NARRATION>
            <ALLINVENTORYENTRIES.LIST>
              <STOCKITEMNAME>Consulting Hours</STOCKITEMNAME>
              <RATE>5000.00/hour</RATE>
              <BILLEDQTY>10 hour</BILLEDQTY>
              <AMOUNT>50000.00</AMOUNT>
              <LEDGERENTRIES.LIST>
                <LEDGERNAME>CGST 9%</LEDGERNAME>
                <AMOUNT>-4500.00</AMOUNT>
              </LEDGERENTRIES.LIST>
              <LEDGERENTRIES.LIST>
                <LEDGERNAME>SGST 9%</LEDGERNAME>
                <AMOUNT>-4500.00</AMOUNT>
              </LEDGERENTRIES.LIST>
            </ALLINVENTORYENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Acme Corp</LEDGERNAME>
              <AMOUNT>59000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Sales Account</LEDGERNAME>
              <AMOUNT>-50000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <GUID>abc-vch-002</GUID>
            <DATE>20240520</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>INV-002</VOUCHERNUMBER>
            <PARTYLEDGERNAME>Acme Corp</PARTYLEDGERNAME>
            <NARRATION>Service-only invoice without inventory</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Acme Corp</LEDGERNAME>
              <AMOUNT>23600.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Sales Account</LEDGERNAME>
              <AMOUNT>-20000.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>IGST 18%</LEDGERNAME>
              <AMOUNT>-3600.00</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
        <TALLYMESSAGE>
          <VOUCHER VCHTYPE="Receipt" ACTION="Create">
            <GUID>abc-vch-003</GUID>
            <DATE>20240525</DATE>
            <VOUCHERNUMBER>RCT-001</VOUCHERNUMBER>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

describe("tallyPrimeParser.detect", () => {
  it("recognises a Tally Prime envelope", () => {
    expect(tallyPrimeParser.detect(FIXTURE_XML)).toBe(true);
  });

  it("rejects non-Tally XML", () => {
    expect(tallyPrimeParser.detect("<root><foo/></root>")).toBe(false);
  });

  it("rejects empty content", () => {
    expect(tallyPrimeParser.detect("")).toBe(false);
  });
});

describe("tallyPrimeParser.parse — ledgers", () => {
  it("extracts all three ledgers", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    expect(result.ledgers).toHaveLength(3);
  });

  it("classifies a Sundry Debtors ledger as customer", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const acme = result.ledgers.find((l) => l.displayName === "Acme Corp");
    expect(acme).toBeDefined();
    expect(acme?.kind).toBe("customer");
    expect(acme?.gstin).toBe("29ABCDE1234F1Z5");
    expect(acme?.stateCode).toBe("Karnataka");
    expect(acme?.phone).toBe("+91-9876543210");
    expect(acme?.email).toBe("contact@acme.example");
    expect(acme?.openingBalance).toBe(-150000);
  });

  it("classifies a Sundry Creditors ledger as vendor", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const supplier = result.ledgers.find((l) => l.displayName === "Office Supplies Ltd");
    expect(supplier?.kind).toBe("vendor");
    expect(supplier?.gstin).toBe("27XYZAB5678C1D9");
    expect(supplier?.openingBalance).toBe(50000);
  });

  it("classifies a Sales Accounts ledger as income", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const sales = result.ledgers.find((l) => l.displayName === "Sales Account");
    expect(sales?.kind).toBe("income");
  });

  it("assigns a deterministic sourceGuid based on ledger name", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const acme = result.ledgers.find((l) => l.displayName === "Acme Corp");
    expect(acme?.sourceGuid).toBe("ledger:acme corp");
  });
});

describe("tallyPrimeParser.parse — sales vouchers", () => {
  it("extracts both sales vouchers (skips Receipt)", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    expect(result.vouchers).toHaveLength(2);
    expect(result.vouchers.every((v) => v.type === "sales")).toBe(true);
  });

  it("warns about the unsupported Receipt voucher", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const w = result.warnings.find((w) => w.code === "voucher_type_unsupported_v1");
    expect(w).toBeDefined();
    expect(w?.message).toMatch(/receipt/i);
  });

  it("parses dates from yyyyMMdd to ISO yyyy-MM-dd", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const inv1 = result.vouchers.find((v) => v.sourceVoucherNumber === "INV-001");
    expect(inv1?.date).toBe("2024-05-15");
  });

  it("preserves voucher number verbatim", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    expect(result.vouchers.map((v) => v.sourceVoucherNumber).sort()).toEqual([
      "INV-001",
      "INV-002",
    ]);
  });

  it("uses Tally GUID as sourceGuid when present", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const inv1 = result.vouchers.find((v) => v.sourceVoucherNumber === "INV-001");
    expect(inv1?.sourceGuid).toBe("abc-vch-001");
  });

  it("extracts inventory lines with GST tax sums", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const inv1 = result.vouchers.find((v) => v.sourceVoucherNumber === "INV-001");
    expect(inv1?.lines).toHaveLength(1);
    const line = inv1!.lines[0];
    expect(line.itemName).toBe("Consulting Hours");
    expect(line.amount).toBe(50000);
    expect(line.quantity).toBe(10);
    expect(line.taxAmount).toBe(9000); // 4500 CGST + 4500 SGST
    expect(line.taxRate).toBe(18);
  });

  it("falls back to ledger entries for service-only vouchers (no inventory)", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const inv2 = result.vouchers.find((v) => v.sourceVoucherNumber === "INV-002");
    expect(inv2?.lines.length).toBeGreaterThan(0);
    const salesLine = inv2!.lines.find((l) => l.itemName === "Sales Account");
    expect(salesLine?.amount).toBe(20000);
  });

  it("computes voucher totals from the party ledger entry", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const inv1 = result.vouchers.find((v) => v.sourceVoucherNumber === "INV-001");
    expect(inv1?.totals.total).toBe(59000);
    expect(inv1?.totals.subtotal).toBe(50000);
    expect(inv1?.totals.tax).toBe(9000);
  });

  it("attaches a partyRef so the mapper can resolve the link post-insert", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const inv1 = result.vouchers.find((v) => v.sourceVoucherNumber === "INV-001");
    expect(inv1?.partyRef).toBeDefined();
    expect(inv1?.partyRef?.sourceGuid).toBe("ledger:acme corp");
    expect(inv1?.partyRef?.displayName).toBe("Acme Corp");
    expect(inv1?.partyRef?.gstin).toBe("29ABCDE1234F1Z5");
  });

  it("preserves narration verbatim", async () => {
    const result = await tallyPrimeParser.parse(FIXTURE_XML);
    const inv1 = result.vouchers.find((v) => v.sourceVoucherNumber === "INV-001");
    expect(inv1?.narration).toBe("Q1 FY26 consulting services");
  });
});

describe("tallyPrimeParser.parse — edge cases", () => {
  it("handles an empty envelope with a warning", async () => {
    const empty = `<?xml version="1.0"?><ENVELOPE><BODY><IMPORTDATA><REQUESTDATA/></IMPORTDATA></BODY></ENVELOPE>`;
    const result = await tallyPrimeParser.parse(empty);
    expect(result.ledgers).toHaveLength(0);
    expect(result.vouchers).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "empty_envelope")).toBe(true);
  });

  it("throws on malformed XML", async () => {
    await expect(tallyPrimeParser.parse("<not closed")).rejects.toThrow(/Tally XML/);
  });

  it("warns on a ledger with no NAME attribute", async () => {
    const xml = `<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
      <TALLYMESSAGE><LEDGER><PARENT>Sundry Debtors</PARENT></LEDGER></TALLYMESSAGE>
    </REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
    const result = await tallyPrimeParser.parse(xml);
    expect(result.ledgers).toHaveLength(0);
    expect(result.warnings.some((w) => w.code === "ledger_missing_name")).toBe(true);
  });

  it("classifies an unknown group as 'other' with a warning", async () => {
    const xml = `<ENVELOPE><BODY><IMPORTDATA><REQUESTDATA>
      <TALLYMESSAGE><LEDGER NAME="Mystery Account"><PARENT>Some Custom Group</PARENT></LEDGER></TALLYMESSAGE>
    </REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
    const result = await tallyPrimeParser.parse(xml);
    expect(result.ledgers[0].kind).toBe("other");
    expect(result.warnings.some((w) => w.code === "ledger_group_unmapped")).toBe(true);
  });
});
