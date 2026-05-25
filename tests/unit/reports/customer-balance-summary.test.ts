import { describe, it, expect } from "vitest";
import {
  buildCustomerBalanceSummary,
  type InvoiceForCustomerBalance,
} from "@/lib/reports/customer-balance-summary";

function inv(
  contactId: string,
  contactName: string,
  total: number,
  amountPaid: number,
  status: string = "SENT",
): InvoiceForCustomerBalance {
  return {
    contactId,
    total,
    amountPaid,
    status,
    contact: { id: contactId, name: contactName },
  };
}

describe("lib/reports/customer-balance-summary", () => {
  it("empty input produces empty output", () => {
    const r = buildCustomerBalanceSummary([]);
    expect(r.rows).toHaveLength(0);
    expect(r.totalInvoiced).toBe(0);
    expect(r.totalReceived).toBe(0);
    expect(r.totalBalance).toBe(0);
    expect(r.customerCount).toBe(0);
  });

  it("single invoice maps to one customer row", () => {
    const r = buildCustomerBalanceSummary([
      inv("c1", "Acme", 1000, 300),
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].customerName).toBe("Acme");
    expect(r.rows[0].invoicedAmount).toBe(1000);
    expect(r.rows[0].amountReceived).toBe(300);
    expect(r.rows[0].closingBalance).toBe(700);
  });

  it("aggregates multiple invoices for the same customer", () => {
    const r = buildCustomerBalanceSummary([
      inv("c1", "Acme", 1000, 500),
      inv("c1", "Acme", 500, 100),
      inv("c1", "Acme", 300, 300),
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].invoicedAmount).toBe(1800);
    expect(r.rows[0].amountReceived).toBe(900);
    expect(r.rows[0].closingBalance).toBe(900);
  });

  it("separates rows per customer", () => {
    const r = buildCustomerBalanceSummary([
      inv("c1", "Acme", 1000, 0),
      inv("c2", "Beta", 500, 0),
      inv("c3", "Gamma", 200, 200),
    ]);
    expect(r.rows).toHaveLength(3);
    expect(r.customerCount).toBe(3);
  });

  it("excludes DRAFT invoices", () => {
    const r = buildCustomerBalanceSummary([
      inv("c1", "Acme", 1000, 0, "DRAFT"),
      inv("c1", "Acme", 500, 100, "SENT"),
    ]);
    expect(r.rows[0].invoicedAmount).toBe(500);
    expect(r.rows[0].amountReceived).toBe(100);
  });

  it("excludes VOID invoices", () => {
    const r = buildCustomerBalanceSummary([
      inv("c1", "Acme", 1000, 0, "VOID"),
      inv("c1", "Acme", 500, 100, "PAID"),
    ]);
    expect(r.rows[0].invoicedAmount).toBe(500);
  });

  it("includes SENT / PARTIALLY_PAID / PAID / OVERDUE", () => {
    const r = buildCustomerBalanceSummary([
      inv("c1", "A", 100, 0, "SENT"),
      inv("c2", "B", 200, 50, "PARTIALLY_PAID"),
      inv("c3", "C", 300, 300, "PAID"),
      inv("c4", "D", 400, 100, "OVERDUE"),
    ]);
    expect(r.rows).toHaveLength(4);
    expect(r.totalInvoiced).toBe(1000);
    expect(r.totalReceived).toBe(450);
    expect(r.totalBalance).toBe(550);
  });

  it("sorts rows by customerName ascending", () => {
    const r = buildCustomerBalanceSummary([
      inv("c3", "Charlie", 100, 0),
      inv("c1", "Alpha", 100, 0),
      inv("c2", "Bravo", 100, 0),
    ]);
    expect(r.rows.map((x) => x.customerName)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });

  it("excludeZeroBalance filters out customers with zero closing balance", () => {
    const r = buildCustomerBalanceSummary(
      [
        inv("c1", "Acme", 1000, 1000), // zero balance
        inv("c2", "Beta", 500, 200), // 300 balance
        inv("c3", "Gamma", 200, 200), // zero balance
      ],
      { excludeZeroBalance: true },
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].customerName).toBe("Beta");
  });

  it("excludeZeroBalance keeps overpaid (negative balance) customers", () => {
    const r = buildCustomerBalanceSummary(
      [
        inv("c1", "Acme", 1000, 1500), // overpaid: -500 balance
      ],
      { excludeZeroBalance: true },
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].closingBalance).toBe(-500);
  });

  it("aggregates totals across all customers", () => {
    const r = buildCustomerBalanceSummary([
      inv("c1", "A", 1000, 400),
      inv("c2", "B", 500, 100),
      inv("c3", "C", 200, 200),
    ]);
    expect(r.totalInvoiced).toBe(1700);
    expect(r.totalReceived).toBe(700);
    expect(r.totalBalance).toBe(1000);
  });

  it("rounds money values to 2 decimals", () => {
    const r = buildCustomerBalanceSummary([
      inv("c1", "Acme", 100.005, 33.333),
    ]);
    expect(r.rows[0].invoicedAmount).toBe(100.01);
    expect(r.rows[0].amountReceived).toBe(33.33);
    expect(r.rows[0].closingBalance).toBe(66.68); // 100.01 - 33.33
  });

  it("preserves customer identifying fields", () => {
    const r = buildCustomerBalanceSummary([
      inv("cust-id-1", "Acme Co", 1000, 0),
    ]);
    expect(r.rows[0].customerId).toBe("cust-id-1");
    expect(r.rows[0].customerName).toBe("Acme Co");
  });
});
