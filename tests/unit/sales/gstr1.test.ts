import { describe, it, expect } from "vitest";
import {
  generateGstr1,
  type Gstr1InvoiceInput,
} from "@/lib/sales/gstr1";

/**
 * Unit tests for the GSTR-1 JSON generator.
 *
 * Covers: B2B/B2CS routing, intra- vs. inter-state split logic,
 * HSN aggregation, date format, period code, multi-invoice grouping.
 */

// Maharashtra supplier (state code 27)
const SUPPLIER_GSTIN = "27ABCDE1234F1Z5";
const PERIOD = { supplierGstin: SUPPLIER_GSTIN, month: 4, year: 2026 };

function invoice(
  over: Partial<Gstr1InvoiceInput> = {}
): Gstr1InvoiceInput {
  return {
    number: "INV-001",
    date: new Date("2026-04-15T00:00:00Z"),
    invoiceValue: 1180,
    customerGstin: null,
    customerStateCode: "27", // intra-state by default
    reverseCharge: false,
    lines: [
      {
        taxableValue: 1000,
        rate: 18,
        quantity: 1,
        unit: "NOS",
        hsnSacCode: "9983",
        description: "Consulting services",
      },
    ],
    ...over,
  };
}

describe("generateGstr1 — basic shape", () => {
  it("returns the supplier GSTIN and formatted period (fp = MMYYYY)", () => {
    const out = generateGstr1([], PERIOD);
    expect(out.gstin).toBe(SUPPLIER_GSTIN);
    expect(out.fp).toBe("042026");
  });

  it("throws when supplierGstin is too short", () => {
    expect(() => generateGstr1([], { ...PERIOD, supplierGstin: "X" })).toThrow();
  });

  it("returns empty sections for an empty invoice list", () => {
    const out = generateGstr1([], PERIOD);
    expect(out.b2b).toEqual([]);
    expect(out.b2cs).toEqual([]);
    expect(out.hsn.data).toEqual([]);
    expect(out.cur_gt).toBe(0);
  });

  it("sums turnover across invoices", () => {
    const out = generateGstr1(
      [
        invoice({ number: "INV-001", invoiceValue: 1000 }),
        invoice({ number: "INV-002", invoiceValue: 2500 }),
      ],
      PERIOD
    );
    expect(out.cur_gt).toBe(3500);
  });
});

describe("generateGstr1 — B2B routing", () => {
  it("routes a customer-with-15-char-GSTIN invoice into B2B", () => {
    const out = generateGstr1(
      [invoice({ customerGstin: "27XYZAB5678G2Z3" })],
      PERIOD
    );
    expect(out.b2b).toHaveLength(1);
    expect(out.b2b[0].ctin).toBe("27XYZAB5678G2Z3");
    expect(out.b2b[0].inv).toHaveLength(1);
    expect(out.b2cs).toHaveLength(0);
  });

  it("groups multiple invoices to the same customer under one ctin", () => {
    const out = generateGstr1(
      [
        invoice({ number: "I-1", customerGstin: "27XYZAB5678G2Z3" }),
        invoice({ number: "I-2", customerGstin: "27XYZAB5678G2Z3" }),
        invoice({ number: "I-3", customerGstin: "29PQRSTU1234X5Y" }),
      ],
      PERIOD
    );
    expect(out.b2b).toHaveLength(2);
    const mh = out.b2b.find((g) => g.ctin.startsWith("27"))!;
    expect(mh.inv.map((i) => i.inum)).toEqual(["I-1", "I-2"]);
  });

  it("formats the invoice date as DD-MM-YYYY", () => {
    const out = generateGstr1(
      [
        invoice({
          customerGstin: "27XYZAB5678G2Z3",
          date: new Date("2026-04-03T00:00:00Z"),
        }),
      ],
      PERIOD
    );
    expect(out.b2b[0].inv[0].idt).toBe("03-04-2026");
  });

  it("marks reverse-charge invoices with rchrg=Y", () => {
    const out = generateGstr1(
      [invoice({ customerGstin: "27XYZAB5678G2Z3", reverseCharge: true })],
      PERIOD
    );
    expect(out.b2b[0].inv[0].rchrg).toBe("Y");
  });
});

describe("generateGstr1 — intra- vs. inter-state split", () => {
  it("intra-state (same state) splits GST into CGST + SGST 50/50", () => {
    const out = generateGstr1(
      [
        invoice({
          customerGstin: "27XYZAB5678G2Z3", // MH supplier, MH customer
        }),
      ],
      PERIOD
    );
    const item = out.b2b[0].inv[0].itms[0];
    // 1000 × 18% = 180; CGST 90, SGST 90, IGST 0
    expect(item.itm_det.camt).toBe(90);
    expect(item.itm_det.samt).toBe(90);
    expect(item.itm_det.iamt).toBe(0);
  });

  it("inter-state (different states) uses IGST only", () => {
    const out = generateGstr1(
      [
        invoice({
          customerGstin: "29PQRSTU1234X5Y", // KA customer; supplier in MH
        }),
      ],
      PERIOD
    );
    const item = out.b2b[0].inv[0].itms[0];
    expect(item.itm_det.iamt).toBe(180);
    expect(item.itm_det.camt).toBe(0);
    expect(item.itm_det.samt).toBe(0);
  });

  it("uses customerStateCode for unregistered when no GSTIN is given", () => {
    // KA B2C customer
    const out = generateGstr1(
      [invoice({ customerGstin: null, customerStateCode: "29" })],
      PERIOD
    );
    expect(out.b2cs).toHaveLength(1);
    expect(out.b2cs[0].sply_ty).toBe("INTER");
    expect(out.b2cs[0].pos).toBe("29");
    expect(out.b2cs[0].iamt).toBe(180);
  });
});

describe("generateGstr1 — B2CS aggregation", () => {
  it("aggregates B2CS rows by (pos × rate)", () => {
    const out = generateGstr1(
      [
        invoice({
          number: "C-1",
          customerGstin: null,
          customerStateCode: "27",
          lines: [
            { taxableValue: 500, rate: 18, quantity: 1, hsnSacCode: "9983" },
          ],
        }),
        invoice({
          number: "C-2",
          customerGstin: null,
          customerStateCode: "27",
          lines: [
            { taxableValue: 300, rate: 18, quantity: 1, hsnSacCode: "9983" },
          ],
        }),
      ],
      PERIOD
    );
    expect(out.b2cs).toHaveLength(1);
    // 500 + 300 = 800; tax 144; intra-state → CGST 72, SGST 72
    expect(out.b2cs[0].txval).toBe(800);
    expect(out.b2cs[0].camt).toBe(72);
    expect(out.b2cs[0].samt).toBe(72);
  });

  it("keeps separate B2CS rows for different rates", () => {
    const out = generateGstr1(
      [
        invoice({
          customerGstin: null,
          customerStateCode: "27",
          lines: [
            { taxableValue: 500, rate: 18, quantity: 1 },
            { taxableValue: 500, rate: 12, quantity: 1 },
          ],
        }),
      ],
      PERIOD
    );
    expect(out.b2cs).toHaveLength(2);
    expect(out.b2cs.map((r) => r.rt).sort()).toEqual([12, 18]);
  });
});

describe("generateGstr1 — HSN summary", () => {
  it("aggregates HSN rows across invoices by (hsn × rate × unit)", () => {
    const out = generateGstr1(
      [
        invoice({
          customerGstin: "27XYZAB5678G2Z3",
          lines: [
            { taxableValue: 1000, rate: 18, quantity: 2, unit: "NOS", hsnSacCode: "9983" },
          ],
        }),
        invoice({
          customerGstin: null,
          customerStateCode: "27",
          lines: [
            { taxableValue: 500, rate: 18, quantity: 1, unit: "NOS", hsnSacCode: "9983" },
          ],
        }),
      ],
      PERIOD
    );
    expect(out.hsn.data).toHaveLength(1);
    expect(out.hsn.data[0].hsn_sc).toBe("9983");
    expect(out.hsn.data[0].qty).toBe(3);
    expect(out.hsn.data[0].txval).toBe(1500);
  });

  it("skips lines with no hsnSacCode", () => {
    const out = generateGstr1(
      [
        invoice({
          customerGstin: "27XYZAB5678G2Z3",
          lines: [
            { taxableValue: 1000, rate: 18, quantity: 1, hsnSacCode: null },
          ],
        }),
      ],
      PERIOD
    );
    expect(out.hsn.data).toEqual([]);
  });

  it("renumbers HSN rows sequentially starting at 1", () => {
    const out = generateGstr1(
      [
        invoice({
          customerGstin: "27XYZAB5678G2Z3",
          lines: [
            { taxableValue: 1000, rate: 18, quantity: 1, hsnSacCode: "9983" },
            { taxableValue: 500, rate: 12, quantity: 1, hsnSacCode: "9984" },
          ],
        }),
      ],
      PERIOD
    );
    expect(out.hsn.data.map((r) => r.num)).toEqual([1, 2]);
  });
});
