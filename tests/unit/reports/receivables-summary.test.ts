import { describe, it, expect } from "vitest";
import {
  buildReceivablesSummary,
  type InvoiceWithCustomer,
} from "@/lib/reports/receivables-summary";

const ASOF = new Date("2026-05-25T00:00:00Z");

function inv(
  id: string,
  customerId: string,
  customerName: string,
  number: string,
  issueDate: string,
  dueDate: string,
  total: number,
  amountPaid: number,
  status: string = "SENT",
): InvoiceWithCustomer {
  return {
    id,
    number,
    issueDate: new Date(issueDate),
    dueDate: new Date(dueDate),
    total,
    amountPaid,
    status,
    contact: { id: customerId, name: customerName },
  };
}

describe("lib/reports/receivables-summary", () => {
  it("empty input produces empty output", () => {
    const r = buildReceivablesSummary([], ASOF);
    expect(r.rows).toHaveLength(0);
    expect(r.totalOutstanding).toBe(0);
    expect(r.invoiceCount).toBe(0);
  });

  it("computes balanceDue = total - amountPaid", () => {
    const r = buildReceivablesSummary(
      [inv("i1", "c1", "Acme", "INV-1", "2026-04-01", "2026-05-01", 1000, 300)],
      ASOF,
    );
    expect(r.rows[0].balanceDue).toBe(700);
    expect(r.totalOutstanding).toBe(700);
    expect(r.invoiceCount).toBe(1);
  });

  it("excludes invoices with zero or negative balance due", () => {
    const r = buildReceivablesSummary(
      [
        inv("i1", "c1", "Acme", "INV-1", "2026-04-01", "2026-05-01", 1000, 1000), // fully paid
        inv("i2", "c2", "Beta", "INV-2", "2026-04-01", "2026-05-01", 500, 600), // overpaid (shouldn't happen but defensive)
        inv("i3", "c3", "Gamma", "INV-3", "2026-04-01", "2026-05-01", 500, 200), // 300 due
      ],
      ASOF,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].customerName).toBe("Gamma");
    expect(r.totalOutstanding).toBe(300);
  });

  it("computes ageDays as floor((asOf - dueDate) / 24h)", () => {
    const r = buildReceivablesSummary(
      [
        // dueDate is May 1, asOf is May 25 → 24 days overdue
        inv("i1", "c1", "Acme", "INV-1", "2026-04-01", "2026-05-01", 1000, 0),
      ],
      ASOF,
    );
    expect(r.rows[0].ageDays).toBe(24);
  });

  it("clamps ageDays at 0 for future-due invoices", () => {
    const r = buildReceivablesSummary(
      [
        // dueDate is June 30 (future), asOf is May 25
        inv("i1", "c1", "Acme", "INV-1", "2026-05-15", "2026-06-30", 1000, 0),
      ],
      ASOF,
    );
    expect(r.rows[0].ageDays).toBe(0);
  });

  it("sorts rows by customerName then dueDate ascending", () => {
    const r = buildReceivablesSummary(
      [
        inv("i1", "c1", "Charlie", "INV-1", "2026-04-01", "2026-05-15", 100, 0),
        inv("i2", "c2", "Alpha", "INV-2", "2026-04-01", "2026-05-10", 100, 0),
        inv("i3", "c1", "Charlie", "INV-3", "2026-04-01", "2026-05-01", 100, 0),
        inv("i4", "c3", "Bravo", "INV-4", "2026-04-01", "2026-05-20", 100, 0),
      ],
      ASOF,
    );
    expect(r.rows.map((x) => x.customerName)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Charlie",
    ]);
    // The two Charlie rows should be sorted by dueDate ascending (May 1 before May 15)
    const charlies = r.rows.filter((x) => x.customerName === "Charlie");
    expect(charlies[0].invoiceNumber).toBe("INV-3"); // dueDate May 1
    expect(charlies[1].invoiceNumber).toBe("INV-1"); // dueDate May 15
  });

  it("propagates status through to the output row", () => {
    const r = buildReceivablesSummary(
      [
        inv("i1", "c1", "Acme", "INV-1", "2026-04-01", "2026-05-01", 1000, 100, "PARTIALLY_PAID"),
        inv("i2", "c2", "Beta", "INV-2", "2026-04-01", "2026-04-01", 1000, 0, "OVERDUE"),
      ],
      ASOF,
    );
    const acme = r.rows.find((x) => x.customerName === "Acme")!;
    expect(acme.status).toBe("PARTIALLY_PAID");
    const beta = r.rows.find((x) => x.customerName === "Beta")!;
    expect(beta.status).toBe("OVERDUE");
  });

  it("rounds money values to 2 decimals", () => {
    const r = buildReceivablesSummary(
      [
        inv("i1", "c1", "Acme", "INV-1", "2026-04-01", "2026-05-01", 100.005, 33.333),
      ],
      ASOF,
    );
    // 100.005 - 33.333 = 66.672 → rounded to 66.67
    expect(r.rows[0].balanceDue).toBe(66.67);
    expect(r.rows[0].total).toBe(100.01); // 100.005 rounds to 100.01 (banker's-ish)
    expect(r.rows[0].amountPaid).toBe(33.33);
  });

  it("aggregates totalOutstanding across multiple invoices", () => {
    const r = buildReceivablesSummary(
      [
        inv("i1", "c1", "A", "INV-1", "2026-04-01", "2026-05-01", 1000, 0),
        inv("i2", "c2", "B", "INV-2", "2026-04-01", "2026-05-01", 500, 200),
        inv("i3", "c3", "C", "INV-3", "2026-04-01", "2026-05-01", 2500, 1000),
      ],
      ASOF,
    );
    // 1000 + 300 + 1500 = 2800
    expect(r.totalOutstanding).toBe(2800);
    expect(r.invoiceCount).toBe(3);
  });

  it("preserves customer + invoice identifying fields in the row", () => {
    const r = buildReceivablesSummary(
      [inv("inv-id-1", "cust-id-1", "Acme Co", "INV-2026-001", "2026-04-01", "2026-05-01", 1000, 0)],
      ASOF,
    );
    const row = r.rows[0];
    expect(row.invoiceId).toBe("inv-id-1");
    expect(row.customerId).toBe("cust-id-1");
    expect(row.customerName).toBe("Acme Co");
    expect(row.invoiceNumber).toBe("INV-2026-001");
  });
});
