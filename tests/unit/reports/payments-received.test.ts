import { describe, it, expect } from "vitest";
import {
  buildPaymentsReceived,
  type PaymentReceivedInput,
} from "@/lib/reports/payments-received";

function payment(
  id: string,
  number: string,
  paymentDate: string,
  amount: number,
  customerId: string,
  customerName: string,
  paymentMode: string | null = "bank_transfer",
  reference: string | null = null,
): PaymentReceivedInput {
  return {
    id,
    number,
    paymentDate: new Date(paymentDate),
    amount,
    paymentMode,
    reference,
    contact: { id: customerId, name: customerName },
  };
}

describe("lib/reports/payments-received", () => {
  it("empty input produces empty output", () => {
    const r = buildPaymentsReceived([]);
    expect(r.rows).toHaveLength(0);
    expect(r.totalAmount).toBe(0);
    expect(r.paymentCount).toBe(0);
  });

  it("single payment row carries all key fields", () => {
    const r = buildPaymentsReceived([
      payment("p1", "PMT-1", "2026-05-15", 1500, "c1", "Acme", "upi", "UTR123"),
    ]);
    expect(r.rows[0].paymentId).toBe("p1");
    expect(r.rows[0].paymentNumber).toBe("PMT-1");
    expect(r.rows[0].customerName).toBe("Acme");
    expect(r.rows[0].amount).toBe(1500);
    expect(r.rows[0].paymentMode).toBe("UPI");
    expect(r.rows[0].reference).toBe("UTR123");
  });

  it("totals aggregate across multiple payments", () => {
    const r = buildPaymentsReceived([
      payment("p1", "PMT-1", "2026-05-15", 1000, "c1", "A"),
      payment("p2", "PMT-2", "2026-05-16", 2500, "c2", "B"),
      payment("p3", "PMT-3", "2026-05-17", 500, "c3", "C"),
    ]);
    expect(r.totalAmount).toBe(4000);
    expect(r.paymentCount).toBe(3);
  });

  it("rows sort by paymentDate descending (most recent first)", () => {
    const r = buildPaymentsReceived([
      payment("p1", "PMT-1", "2026-05-15", 100, "c1", "A"),
      payment("p2", "PMT-2", "2026-05-20", 100, "c2", "B"),
      payment("p3", "PMT-3", "2026-05-17", 100, "c3", "C"),
    ]);
    expect(r.rows.map((x) => x.paymentNumber)).toEqual([
      "PMT-2", // May 20
      "PMT-3", // May 17
      "PMT-1", // May 15
    ]);
  });

  it("ties on date break by paymentNumber ascending", () => {
    const r = buildPaymentsReceived([
      payment("p1", "PMT-3", "2026-05-15", 100, "c1", "A"),
      payment("p2", "PMT-1", "2026-05-15", 100, "c2", "B"),
      payment("p3", "PMT-2", "2026-05-15", 100, "c3", "C"),
    ]);
    expect(r.rows.map((x) => x.paymentNumber)).toEqual([
      "PMT-1",
      "PMT-2",
      "PMT-3",
    ]);
  });

  it("humanizes known paymentMode values", () => {
    const r = buildPaymentsReceived([
      payment("p1", "PMT-1", "2026-05-15", 100, "c1", "A", "cash"),
      payment("p2", "PMT-2", "2026-05-15", 100, "c2", "B", "bank_transfer"),
      payment("p3", "PMT-3", "2026-05-15", 100, "c3", "C", "cheque"),
      payment("p4", "PMT-4", "2026-05-15", 100, "c4", "D", "credit_card"),
      payment("p5", "PMT-5", "2026-05-15", 100, "c5", "E", "upi"),
    ]);
    const modes = r.rows.map((x) => x.paymentMode).sort();
    expect(modes).toEqual([
      "Bank Transfer",
      "Cash",
      "Cheque",
      "Credit Card",
      "UPI",
    ]);
  });

  it("falls back to title-case for unknown paymentMode", () => {
    const r = buildPaymentsReceived([
      payment("p1", "PMT-1", "2026-05-15", 100, "c1", "A", "wire_transfer"),
    ]);
    expect(r.rows[0].paymentMode).toBe("Wire Transfer");
  });

  it("substitutes em-dash for null paymentMode", () => {
    const r = buildPaymentsReceived([
      payment("p1", "PMT-1", "2026-05-15", 100, "c1", "A", null),
    ]);
    expect(r.rows[0].paymentMode).toBe("—");
  });

  it("substitutes empty string for null reference", () => {
    const r = buildPaymentsReceived([
      payment("p1", "PMT-1", "2026-05-15", 100, "c1", "A", "upi", null),
    ]);
    expect(r.rows[0].reference).toBe("");
  });

  it("rounds amount to 2 decimals", () => {
    const r = buildPaymentsReceived([
      payment("p1", "PMT-1", "2026-05-15", 100.005, "c1", "A"),
    ]);
    expect(r.rows[0].amount).toBe(100.01);
  });

  it("totalAmount sums after rounding", () => {
    const r = buildPaymentsReceived([
      payment("p1", "PMT-1", "2026-05-15", 100.10, "c1", "A"),
      payment("p2", "PMT-2", "2026-05-16", 200.20, "c2", "B"),
      payment("p3", "PMT-3", "2026-05-17", 300.30, "c3", "C"),
    ]);
    expect(r.totalAmount).toBe(600.6);
  });
});
