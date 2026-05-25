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
  amountPaid: number,
  status: string = "PAID",
): InvoiceForSalesByCustomer {
  return {
    id,
    contactId,
    total,
    amountPaid,
    status,
    contact: { id: contactId, name: contactName },
  };
}

describe("lib/reports/sales-by-customer", () => {
  it("empty input produces empty output", () => {
    const r = buildSalesByCustomer([]);
    expect(r.rows).toHaveLength(0);
    expect(r.totalGross).toBe(0);
    expect(r.totalPaid).toBe(0);
    expect(r.totalBalance).toBe(0);
    expect(r.customerCount).toBe(0);
  });

  it("aggregates multiple invoices for the same customer", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "Acme", 1000, 1000),
      inv("i2", "c1", "Acme", 500, 200),
      inv("i3", "c1", "Acme", 300, 300),
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].customerName).toBe("Acme");
    expect(r.rows[0].invoiceCount).toBe(3);
    expect(r.rows[0].grossSales).toBe(1800);
    expect(r.rows[0].amountPaid).toBe(1500);
    expect(r.rows[0].balanceDue).toBe(300);
  });

  it("separates rows per customer", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "Acme", 1000, 0),
      inv("i2", "c2", "Beta", 500, 0),
    ]);
    expect(r.rows).toHaveLength(2);
    expect(r.customerCount).toBe(2);
  });

  it("sorts by grossSales descending", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "A", 100, 0),
      inv("i2", "c2", "B", 5000, 0),
      inv("i3", "c3", "C", 1000, 0),
    ]);
    expect(r.rows.map((x) => x.customerName)).toEqual(["B", "C", "A"]);
  });

  it("breaks gross-sales ties by customerName ascending", () => {
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
      inv("i2", "c1", "Acme", 500, 200, "SENT"),
    ]);
    expect(r.rows[0].invoiceCount).toBe(1);
    expect(r.rows[0].grossSales).toBe(500);
  });

  it("excludes VOID invoices", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "Acme", 1000, 0, "VOID"),
      inv("i2", "c1", "Acme", 500, 200, "PAID"),
    ]);
    expect(r.rows[0].invoiceCount).toBe(1);
    expect(r.rows[0].grossSales).toBe(500);
  });

  it("includes SENT / PARTIALLY_PAID / PAID / OVERDUE", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "A", 100, 0, "SENT"),
      inv("i2", "c2", "B", 200, 50, "PARTIALLY_PAID"),
      inv("i3", "c3", "C", 300, 300, "PAID"),
      inv("i4", "c4", "D", 400, 100, "OVERDUE"),
    ]);
    expect(r.rows).toHaveLength(4);
    expect(r.totalGross).toBe(1000);
  });

  it("computes balanceDue per customer = grossSales - amountPaid", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "Acme", 1000, 300),
      inv("i2", "c1", "Acme", 500, 100),
    ]);
    expect(r.rows[0].grossSales).toBe(1500);
    expect(r.rows[0].amountPaid).toBe(400);
    expect(r.rows[0].balanceDue).toBe(1100);
  });

  it("aggregates totals across all customers", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "A", 1000, 400),
      inv("i2", "c2", "B", 500, 100),
      inv("i3", "c3", "C", 200, 200),
    ]);
    expect(r.totalGross).toBe(1700);
    expect(r.totalPaid).toBe(700);
    expect(r.totalBalance).toBe(1000);
  });

  it("rounds money values to 2 decimals", () => {
    const r = buildSalesByCustomer([
      inv("i1", "c1", "Acme", 100.005, 33.333),
    ]);
    expect(r.rows[0].grossSales).toBe(100.01);
    expect(r.rows[0].amountPaid).toBe(33.33);
  });

  it("preserves customer identifying fields", () => {
    const r = buildSalesByCustomer([
      inv("inv-id-1", "cust-id-1", "Acme Co", 1000, 0),
    ]);
    expect(r.rows[0].customerId).toBe("cust-id-1");
    expect(r.rows[0].customerName).toBe("Acme Co");
  });
});
