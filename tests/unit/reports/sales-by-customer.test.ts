import { describe, it, expect } from "vitest";
import {
  buildSalesByCustomer,
  type InvoiceForSalesByCustomer,
} from "@/lib/reports/sales-by-customer";

function inv(
  id: string,
  contactId: string,
  contactName: string,
  total: number,
  taxTotal: number,
  status: string = "PAID",
): InvoiceForSalesByCustomer {
  return {
    id,
    contactId,
    total,
    taxTotal,
    status,
    contact: { id: contactId, name: contactName },
  };
}

describe("lib/reports/sales-by-customer", () => {
  it("empty input produces empty output", () => {
    const r = buildSalesByCustomer([]);
    expect(r.rows).toHaveLength(0);
    expect(r.totalSales).toBe(0);
    expect(r.totalSalesWithTax).toBe(0);
    expect(r.customerCount).toBe(0);
  });

  it("computes sales (pre-tax) = total - taxTotal", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "Acme", 1180, 180), // 1000 + 18% GST
    ]);
    expect(r.rows[0].salesWithTax).toBe(1180);
    expect(r.rows[0].sales).toBe(1000);
  });

  it("aggregates multiple invoices for the same customer", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "Acme", 1180, 180),
      inv("i2", "c1", "Acme", 590, 90),
      inv("i3", "c1", "Acme", 354, 54),
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].invoiceCount).toBe(3);
    expect(r.rows[0].sales).toBe(1800); // 1000+500+300
    expect(r.rows[0].salesWithTax).toBe(2124); // 1180+590+354
  });

  it("separates rows per customer", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "Acme", 1000, 0),
      inv("i2", "c2", "Beta", 500, 0),
    ]);
    expect(r.rows).toHaveLength(2);
    expect(r.customerCount).toBe(2);
  });

  it("sorts by salesWithTax descending", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "A", 100, 0),
      inv("i2", "c2", "B", 5000, 0),
      inv("i3", "c3", "C", 1000, 0),
    ]);
    expect(r.rows.map((x) => x.customerName)).toEqual(["B", "C", "A"]);
  });

  it("breaks salesWithTax ties by customerName ascending", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c3", "Charlie", 1000, 0),
      inv("i2", "c1", "Alpha", 1000, 0),
      inv("i3", "c2", "Bravo", 1000, 0),
    ]);
    expect(r.rows.map((x) => x.customerName)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });

  it("excludes DRAFT invoices", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "Acme", 1000, 0, "DRAFT"),
      inv("i2", "c1", "Acme", 500, 0, "SENT"),
    ]);
    expect(r.rows[0].invoiceCount).toBe(1);
    expect(r.rows[0].sales).toBe(500);
    expect(r.rows[0].salesWithTax).toBe(500);
  });

  it("excludes VOID invoices", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "Acme", 1000, 0, "VOID"),
      inv("i2", "c1", "Acme", 500, 0, "PAID"),
    ]);
    expect(r.rows[0].invoiceCount).toBe(1);
    expect(r.rows[0].salesWithTax).toBe(500);
  });

  it("includes SENT / PARTIALLY_PAID / PAID / OVERDUE", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "A", 100, 0, "SENT"),
      inv("i2", "c2", "B", 200, 0, "PARTIALLY_PAID"),
      inv("i3", "c3", "C", 300, 0, "PAID"),
      inv("i4", "c4", "D", 400, 0, "OVERDUE"),
    ]);
    expect(r.rows).toHaveLength(4);
    expect(r.totalSalesWithTax).toBe(1000);
  });

  it("aggregates totals across all customers", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "A", 1180, 180),
      inv("i2", "c2", "B", 590, 90),
      inv("i3", "c3", "C", 236, 36),
    ]);
    expect(r.totalSales).toBe(1700); // 1000+500+200
    expect(r.totalSalesWithTax).toBe(2006); // 1180+590+236
  });

  it("rounds money values to 2 decimals", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "Acme", 100.005, 18.001),
    ]);
    expect(r.rows[0].salesWithTax).toBe(100.01);
    expect(r.rows[0].sales).toBe(82.0); // 100.005 - 18.001 = 82.004 → 82.00
  });

  it("preserves customer identifying fields", () => {
    const r = buildSalesByCustomer([
      inv("inv-id-1", "cust-id-1", "Acme Co", 1000, 0),
    ]);
    expect(r.rows[0].customerId).toBe("cust-id-1");
    expect(r.rows[0].customerName).toBe("Acme Co");
  });

  it("handles invoices with zero tax correctly", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "Acme", 1000, 0),
    ]);
    expect(r.rows[0].sales).toBe(1000);
    expect(r.rows[0].salesWithTax).toBe(1000);
  });
});
