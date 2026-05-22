import { describe, it, expect } from "vitest";
import {
  computeArAgingDetails,
  groupArAgingDetails,
  bucketForAge,
  bucketLabels,
  type ArAgingCreditNoteInput,
  type ArAgingDetailsInvoiceInput,
} from "@/lib/reports/ar-aging-details";

/**
 * RPT-AR-DETAILS tests — bucket math + status filter + sort stability
 * + v2: Credit Notes + groupBy + amount range + bucket filter.
 *
 * All fixtures use a fixed `asOf` so age math is deterministic.
 */

const ASOF = new Date(Date.UTC(2026, 4, 22)); // 2026-05-22

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

function cn(
  partial: Partial<ArAgingCreditNoteInput> & Pick<ArAgingCreditNoteInput, "id">
): ArAgingCreditNoteInput {
  return {
    number: `CN-${partial.id}`,
    date: days(-20),
    total: 2_000,
    amountApplied: 0,
    amountRefunded: 0,
    status: "OPEN",
    contactId: "cust-1",
    contact: { displayName: "Acme Corp" },
    ...partial,
  };
}

describe("lib/reports/ar-aging-details — bucket helpers", () => {
  it("bucketForAge: returns 'Current' for age <= 0", () => {
    expect(bucketForAge(-5, 4, 15)).toBe("Current");
    expect(bucketForAge(0, 4, 15)).toBe("Current");
  });
  it("bucketForAge: age=1 → first bucket", () => {
    expect(bucketForAge(1, 4, 15)).toBe("1-15");
  });
  it("bucketForAge: age=15 (boundary) → first bucket", () => {
    expect(bucketForAge(15, 4, 15)).toBe("1-15");
  });
  it("bucketForAge: age=16 → second bucket", () => {
    expect(bucketForAge(16, 4, 15)).toBe("16-30");
  });
  it("bucketForAge: age=60 → 46-60 bucket", () => {
    expect(bucketForAge(60, 4, 15)).toBe("46-60");
  });
  it("bucketForAge: age=61 → overflow 61+", () => {
    expect(bucketForAge(61, 4, 15)).toBe("61+");
    expect(bucketForAge(365, 4, 15)).toBe("61+");
  });
  it("bucketForAge: respects 30-day intervalSize", () => {
    expect(bucketForAge(45, 4, 30)).toBe("31-60");
    expect(bucketForAge(121, 4, 30)).toBe("121+");
  });
  it("bucketLabels: 4x15 grid", () => {
    expect(bucketLabels(4, 15)).toEqual([
      "Current", "1-15", "16-30", "31-45", "46-60", "61+",
    ]);
  });
  it("bucketLabels: 3x30 grid", () => {
    expect(bucketLabels(3, 30)).toEqual([
      "Current", "1-30", "31-60", "61-90", "91+",
    ]);
  });
});

describe("lib/reports/ar-aging-details — computeArAgingDetails (v1)", () => {
  it("empty input → empty output", () => {
    expect(computeArAgingDetails({ invoices: [], asOf: ASOF })).toEqual([]);
  });

  it("excludes invoices with balanceDue <= 0", () => {
    const rows = computeArAgingDetails({
      invoices: [inv({ id: "1", total: 5_000, amountPaid: 5_000 })],
      asOf: ASOF,
    });
    expect(rows).toEqual([]);
  });

  it("excludes DRAFT, VOID, WRITTEN_OFF, PAID by default", () => {
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

  it("includes SENT, PARTIALLY_PAID, OVERDUE by default", () => {
    const rows = computeArAgingDetails({
      invoices: [
        inv({ id: "s", status: "SENT" }),
        inv({ id: "pp", status: "PARTIALLY_PAID", amountPaid: 2_000 }),
        inv({ id: "o", status: "OVERDUE" }),
      ],
      asOf: ASOF,
    });
    expect(rows.map((r) => r.rowId).sort()).toEqual(["o", "pp", "s"]);
  });

  it("5-day overdue → age=5, bucket=1-15, status=Sent", () => {
    const rows = computeArAgingDetails({
      invoices: [inv({ id: "1", dueDate: days(-5) })],
      asOf: ASOF,
    });
    expect(rows[0].age).toBe(5);
    expect(rows[0].bucket).toBe("1-15");
    expect(rows[0].status).toBe("Sent");
  });

  it("not yet due → age negative, bucket Current", () => {
    const rows = computeArAgingDetails({
      invoices: [inv({ id: "1", dueDate: days(10) })],
      asOf: ASOF,
    });
    expect(rows[0].age).toBe(-10);
    expect(rows[0].bucket).toBe("Current");
  });

  it("100-day overdue → 61+ overflow bucket (default 4x15)", () => {
    const rows = computeArAgingDetails({
      invoices: [inv({ id: "1", dueDate: days(-100) })],
      asOf: ASOF,
    });
    expect(rows[0].age).toBe(100);
    expect(rows[0].bucket).toBe("61+");
  });

  it("agingBy='issueDate' uses issueDate", () => {
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

  it("customerId filter restricts result", () => {
    const rows = computeArAgingDetails({
      invoices: [
        inv({ id: "1", contactId: "cust-1" }),
        inv({ id: "2", contactId: "cust-2" }),
      ],
      asOf: ASOF,
      customerId: "cust-2",
    });
    expect(rows.map((r) => r.rowId)).toEqual(["2"]);
  });

  it("sorts by age desc by default", () => {
    const rows = computeArAgingDetails({
      invoices: [
        inv({ id: "young", dueDate: days(-5) }),
        inv({ id: "old", dueDate: days(-90) }),
        inv({ id: "mid", dueDate: days(-30) }),
      ],
      asOf: ASOF,
    });
    expect(rows.map((r) => r.rowId)).toEqual(["old", "mid", "young"]);
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
    expect(rows.map((r) => r.rowId)).toEqual(["small", "mid", "big"]);
  });

  it("sort ties broken deterministically by rowId", () => {
    const rows = computeArAgingDetails({
      invoices: [
        inv({ id: "c", dueDate: days(-10) }),
        inv({ id: "a", dueDate: days(-10) }),
        inv({ id: "b", dueDate: days(-10) }),
      ],
      asOf: ASOF,
    });
    expect(rows.map((r) => r.rowId)).toEqual(["a", "b", "c"]);
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

  it("balanceDue = total - amountPaid", () => {
    const rows = computeArAgingDetails({
      invoices: [
        inv({ id: "1", total: 10_000, amountPaid: 3_500, status: "PARTIALLY_PAID" }),
      ],
      asOf: ASOF,
    });
    expect(rows[0].amount).toBe(10_000);
    expect(rows[0].balanceDue).toBe(6_500);
  });

  it("marks invoice rows with source='invoice' and type='Invoice'", () => {
    const rows = computeArAgingDetails({
      invoices: [inv({ id: "1" })],
      asOf: ASOF,
    });
    expect(rows[0].source).toBe("invoice");
    expect(rows[0].type).toBe("Invoice");
  });
});

describe("lib/reports/ar-aging-details — v2 Credit Notes", () => {
  it("ignores credit notes by default (entities defaults to invoice only)", () => {
    const rows = computeArAgingDetails({
      invoices: [],
      creditNotes: [cn({ id: "1" })],
      asOf: ASOF,
    });
    expect(rows).toEqual([]);
  });

  it("includes credit notes when entities=['invoice','creditnote']", () => {
    const rows = computeArAgingDetails({
      invoices: [],
      creditNotes: [cn({ id: "1" })],
      asOf: ASOF,
      entities: ["invoice", "creditnote"],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("creditnote");
    expect(rows[0].type).toBe("Credit Note");
  });

  it("credit note row shows negative amount and balanceDue", () => {
    const rows = computeArAgingDetails({
      invoices: [],
      creditNotes: [cn({ id: "1", total: 2_500 })],
      asOf: ASOF,
      entities: ["creditnote"],
    });
    expect(rows[0].amount).toBe(-2_500);
    expect(rows[0].balanceDue).toBe(-2_500);
  });

  it("credit note with full amount applied is excluded", () => {
    const rows = computeArAgingDetails({
      invoices: [],
      creditNotes: [cn({ id: "1", total: 2_000, amountApplied: 2_000 })],
      asOf: ASOF,
      entities: ["creditnote"],
    });
    expect(rows).toEqual([]);
  });

  it("CLOSED and VOID credit notes are excluded", () => {
    const rows = computeArAgingDetails({
      invoices: [],
      creditNotes: [
        cn({ id: "c", status: "CLOSED" }),
        cn({ id: "v", status: "VOID" }),
      ],
      asOf: ASOF,
      entities: ["creditnote"],
    });
    expect(rows).toEqual([]);
  });

  it("partially-applied credit note shows remaining unapplied as negative balance", () => {
    const rows = computeArAgingDetails({
      invoices: [],
      creditNotes: [
        cn({ id: "1", total: 5_000, amountApplied: 1_000, amountRefunded: 500 }),
      ],
      asOf: ASOF,
      entities: ["creditnote"],
    });
    expect(rows[0].balanceDue).toBe(-3_500);
  });
});

describe("lib/reports/ar-aging-details — v2 filters", () => {
  it("statusFilter=['OVERDUE'] only returns OVERDUE rows", () => {
    const rows = computeArAgingDetails({
      invoices: [
        inv({ id: "s", status: "SENT" }),
        inv({ id: "o", status: "OVERDUE" }),
        inv({ id: "pp", status: "PARTIALLY_PAID", amountPaid: 1 }),
      ],
      asOf: ASOF,
      statusFilter: ["OVERDUE"],
    });
    expect(rows.map((r) => r.rowId)).toEqual(["o"]);
  });

  it("amountMin and amountMax exclude rows outside the range", () => {
    const rows = computeArAgingDetails({
      invoices: [
        inv({ id: "tiny", total: 500 }),
        inv({ id: "mid", total: 7_500 }),
        inv({ id: "huge", total: 100_000 }),
      ],
      asOf: ASOF,
      amountMin: 1_000,
      amountMax: 50_000,
    });
    expect(rows.map((r) => r.rowId)).toEqual(["mid"]);
  });

  it("bucketFilter restricts to specified buckets only", () => {
    const rows = computeArAgingDetails({
      invoices: [
        inv({ id: "current", dueDate: days(10) }),
        inv({ id: "early", dueDate: days(-5) }),
        inv({ id: "old", dueDate: days(-100) }),
      ],
      asOf: ASOF,
      bucketFilter: ["1-15"],
    });
    expect(rows.map((r) => r.rowId)).toEqual(["early"]);
  });

  it("customer + status filters compose (AND semantics)", () => {
    const rows = computeArAgingDetails({
      invoices: [
        inv({ id: "1", contactId: "cust-1", status: "OVERDUE" }),
        inv({ id: "2", contactId: "cust-1", status: "SENT" }),
        inv({ id: "3", contactId: "cust-2", status: "OVERDUE" }),
      ],
      asOf: ASOF,
      customerId: "cust-1",
      statusFilter: ["OVERDUE"],
    });
    expect(rows.map((r) => r.rowId)).toEqual(["1"]);
  });
});

describe("lib/reports/ar-aging-details — groupArAgingDetails", () => {
  function sampleRows() {
    return computeArAgingDetails({
      invoices: [
        inv({ id: "1", contactId: "cust-1", contact: { displayName: "Acme" }, dueDate: days(-5), total: 1_000 }),
        inv({ id: "2", contactId: "cust-1", contact: { displayName: "Acme" }, dueDate: days(-40), total: 2_000 }),
        inv({ id: "3", contactId: "cust-2", contact: { displayName: "Beta" }, dueDate: days(-100), total: 5_000 }),
      ],
      asOf: ASOF,
    });
  }

  it("groupBy='none' returns single 'All' group with all rows", () => {
    const rows = sampleRows();
    const groups = groupArAgingDetails(rows, "none");
    expect(groups).toHaveLength(1);
    expect(groups[0].groupKey).toBe("all");
    expect(groups[0].rows).toHaveLength(3);
    expect(groups[0].subtotal).toBe(8_000);
  });

  it("groupBy='customer' returns one group per customer with correct subtotal", () => {
    const rows = sampleRows();
    const groups = groupArAgingDetails(rows, "customer");
    expect(groups).toHaveLength(2);
    const acme = groups.find((g) => g.groupLabel === "Acme")!;
    const beta = groups.find((g) => g.groupLabel === "Beta")!;
    expect(acme.subtotal).toBe(3_000);
    expect(beta.subtotal).toBe(5_000);
  });

  it("groupBy='customer' subtotal correctly nets credit notes against invoices", () => {
    const rows = computeArAgingDetails({
      invoices: [inv({ id: "1", contactId: "cust-1", contact: { displayName: "Acme" }, total: 10_000 })],
      creditNotes: [
        cn({ id: "cn1", contactId: "cust-1", contact: { displayName: "Acme" }, total: 3_000 }),
      ],
      asOf: ASOF,
      entities: ["invoice", "creditnote"],
    });
    const groups = groupArAgingDetails(rows, "customer");
    expect(groups).toHaveLength(1);
    expect(groups[0].subtotal).toBe(7_000); // 10000 invoice - 3000 credit note
  });

  it("groupBy='bucket' returns one group per bucket in canonical order", () => {
    const rows = sampleRows();
    const labels = bucketLabels(4, 15);
    const groups = groupArAgingDetails(rows, "bucket", labels);
    const keys = groups.map((g) => g.groupKey);
    expect(keys).toContain("1-15");
    expect(keys).toContain("31-45");
    expect(keys).toContain("61+");
    // Canonical ordering: 1-15 should come before 31-45 should come before 61+
    expect(keys.indexOf("1-15")).toBeLessThan(keys.indexOf("31-45"));
    expect(keys.indexOf("31-45")).toBeLessThan(keys.indexOf("61+"));
  });

  it("groupBy='status' groups by status label", () => {
    const rows = computeArAgingDetails({
      invoices: [
        inv({ id: "s1", status: "SENT" }),
        inv({ id: "s2", status: "SENT" }),
        inv({ id: "o", status: "OVERDUE" }),
      ],
      asOf: ASOF,
    });
    const groups = groupArAgingDetails(rows, "status");
    expect(groups).toHaveLength(2);
    const sent = groups.find((g) => g.groupLabel === "Sent")!;
    expect(sent.rows).toHaveLength(2);
  });
});
