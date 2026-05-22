import { describe, it, expect } from "vitest";
import {
  computeArAgingDetails,
  bucketForAge,
  bucketLabels,
  type ArAgingDetailsInvoiceInput,
} from "@/lib/reports/ar-aging-details";

/**
 * RPT-AR-DETAILS tests — bucket math + status filter + sort stability.
 *
 * All fixtures use a fixed `asOf` so age math is deterministic.
 */

const ASOF = new Date(Date.UTC(2026, 4, 22)); // 2026-05-22 (Friday)

function days(offsetFromAsOf: number): Date {
  return new Date(ASOF.getTime() + offsetFromAsOf * 86_400_000);
}

function inv(
  partial: Partial<ArAgingDetailsInvoiceInput> & Pick<ArAgingDetailsInvoiceInput, "id">
): ArAgingDetailsInvoiceInput {
  return {
    number: `INV-${partial.id}`,
    issueDate: days(-60),
    dueDate: days(-30),
    total: 10_000,
    amountPaid: 0,
    status: "SENT",
    contactId: "cust-1",
    contact: { displayName: "Acme Corp" },
    ...partial,
  };
}

describe("lib/reports/ar-aging-details", () => {
  describe("bucketForAge", () => {
    it("returns 'Current' for age <= 0 (not yet due)", () => {
      expect(bucketForAge(-5, 4, 15)).toBe("Current");
      expect(bucketForAge(0, 4, 15)).toBe("Current");
    });
    it("places age=1 into the first bucket", () => {
      expect(bucketForAge(1, 4, 15)).toBe("1-15");
    });
    it("places age=15 (boundary) into the first bucket", () => {
      expect(bucketForAge(15, 4, 15)).toBe("1-15");
    });
    it("places age=16 into the second bucket", () => {
      expect(bucketForAge(16, 4, 15)).toBe("16-30");
    });
    it("places age=60 (last fixed bucket boundary) correctly", () => {
      expect(bucketForAge(60, 4, 15)).toBe("46-60");
    });
    it("rolls age > intervalCount * intervalSize into the overflow bucket", () => {
      expect(bucketForAge(61, 4, 15)).toBe("61+");
      expect(bucketForAge(365, 4, 15)).toBe("61+");
    });
    it("respects a 30-day intervalSize", () => {
      expect(bucketForAge(45, 4, 30)).toBe("31-60");
      expect(bucketForAge(121, 4, 30)).toBe("121+");
    });
  });

  describe("bucketLabels", () => {
    it("emits Current + intervalCount fixed + overflow", () => {
      expect(bucketLabels(4, 15)).toEqual([
        "Current",
        "1-15",
        "16-30",
        "31-45",
        "46-60",
        "61+",
      ]);
    });
    it("works for 3 × 30 days", () => {
      expect(bucketLabels(3, 30)).toEqual([
        "Current",
        "1-30",
        "31-60",
        "61-90",
        "91+",
      ]);
    });
  });

  describe("computeArAgingDetails", () => {
    it("returns empty array when given no invoices", () => {
      expect(computeArAgingDetails({ invoices: [], asOf: ASOF })).toEqual([]);
    });

    it("excludes invoices with balanceDue <= 0", () => {
      const rows = computeArAgingDetails({
        invoices: [inv({ id: "1", total: 5_000, amountPaid: 5_000 })],
        asOf: ASOF,
      });
      expect(rows).toEqual([]);
    });

    it("excludes DRAFT, VOID, WRITTEN_OFF, and PAID invoices", () => {
      const rows = computeArAgingDetails({
        invoices: [
          inv({ id: "d", status: "DRAFT" }),
          inv({ id: "v", status: "VOID" }),
          inv({ id: "w", status: "WRITTEN_OFF" }),
          inv({ id: "p", status: "PAID" }),
        ],
        asOf: ASOF,
      });
      expect(rows).toEqual([]);
    });

    it("includes SENT, PARTIALLY_PAID, and OVERDUE invoices", () => {
      const rows = computeArAgingDetails({
        invoices: [
          inv({ id: "s", status: "SENT" }),
          inv({ id: "pp", status: "PARTIALLY_PAID", amountPaid: 2_000 }),
          inv({ id: "o", status: "OVERDUE" }),
        ],
        asOf: ASOF,
      });
      expect(rows.map((r) => r.invoiceId).sort()).toEqual(["o", "pp", "s"]);
    });

    it("for a 5-day-overdue invoice: age=5, bucket=1-15, status=Sent", () => {
      const rows = computeArAgingDetails({
        invoices: [inv({ id: "1", dueDate: days(-5) })],
        asOf: ASOF,
      });
      expect(rows).toHaveLength(1);
      expect(rows[0].age).toBe(5);
      expect(rows[0].bucket).toBe("1-15");
      expect(rows[0].status).toBe("Sent");
    });

    it("for an invoice not yet due: age negative, bucket=Current", () => {
      const rows = computeArAgingDetails({
        invoices: [inv({ id: "1", dueDate: days(10) })],
        asOf: ASOF,
      });
      expect(rows[0].age).toBe(-10);
      expect(rows[0].bucket).toBe("Current");
    });

    it("rolls a 100-day-overdue invoice into the 61+ overflow bucket (default 4x15)", () => {
      const rows = computeArAgingDetails({
        invoices: [inv({ id: "1", dueDate: days(-100) })],
        asOf: ASOF,
      });
      expect(rows[0].age).toBe(100);
      expect(rows[0].bucket).toBe("61+");
    });

    it("agingBy='issueDate' uses issueDate instead of dueDate", () => {
      const rows = computeArAgingDetails({
        invoices: [inv({ id: "1", issueDate: days(-50), dueDate: days(-10) })],
        asOf: ASOF,
        agingBy: "issueDate",
      });
      expect(rows[0].age).toBe(50);
      expect(rows[0].bucket).toBe("46-60");
    });

    it("respects custom intervalCount and intervalSize", () => {
      const rows = computeArAgingDetails({
        invoices: [inv({ id: "1", dueDate: days(-45) })],
        asOf: ASOF,
        intervalCount: 3,
        intervalSize: 30,
      });
      expect(rows[0].bucket).toBe("31-60");
    });

    it("customerId filter restricts the result set", () => {
      const rows = computeArAgingDetails({
        invoices: [
          inv({ id: "1", contactId: "cust-1" }),
          inv({ id: "2", contactId: "cust-2" }),
        ],
        asOf: ASOF,
        customerId: "cust-2",
      });
      expect(rows.map((r) => r.invoiceId)).toEqual(["2"]);
    });

    it("sorts by age desc by default (oldest first)", () => {
      const rows = computeArAgingDetails({
        invoices: [
          inv({ id: "young", dueDate: days(-5) }),
          inv({ id: "old", dueDate: days(-90) }),
          inv({ id: "mid", dueDate: days(-30) }),
        ],
        asOf: ASOF,
      });
      expect(rows.map((r) => r.invoiceId)).toEqual(["old", "mid", "young"]);
    });

    it("sorts by balanceDue asc when asked", () => {
      const rows = computeArAgingDetails({
        invoices: [
          inv({ id: "big", total: 50_000 }),
          inv({ id: "small", total: 1_000 }),
          inv({ id: "mid", total: 10_000 }),
        ],
        asOf: ASOF,
        sortBy: "balanceDue",
        sortDir: "asc",
      });
      expect(rows.map((r) => r.invoiceId)).toEqual(["small", "mid", "big"]);
    });

    it("ties on sort key are broken deterministically by invoiceId", () => {
      const rows = computeArAgingDetails({
        invoices: [
          inv({ id: "c", dueDate: days(-10) }),
          inv({ id: "a", dueDate: days(-10) }),
          inv({ id: "b", dueDate: days(-10) }),
        ],
        asOf: ASOF,
      });
      expect(rows.map((r) => r.invoiceId)).toEqual(["a", "b", "c"]);
    });

    it("formats dates as yyyy-MM-dd in UTC", () => {
      const rows = computeArAgingDetails({
        invoices: [
          inv({
            id: "1",
            issueDate: new Date(Date.UTC(2026, 0, 15)),
            dueDate: new Date(Date.UTC(2026, 1, 14)),
          }),
        ],
        asOf: ASOF,
      });
      expect(rows[0].date).toBe("2026-01-15");
      expect(rows[0].dueDate).toBe("2026-02-14");
    });

    it("computes balanceDue as total - amountPaid", () => {
      const rows = computeArAgingDetails({
        invoices: [
          inv({
            id: "1",
            total: 10_000,
            amountPaid: 3_500,
            status: "PARTIALLY_PAID",
          }),
        ],
        asOf: ASOF,
      });
      expect(rows[0].amount).toBe(10_000);
      expect(rows[0].balanceDue).toBe(6_500);
    });
  });
});
