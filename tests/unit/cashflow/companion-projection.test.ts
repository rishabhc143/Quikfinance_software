import { describe, it, expect, vi, beforeEach } from "vitest";
import { format } from "date-fns";

vi.mock("@/lib/db", () => ({
  db: {
    companionVoucher: { findMany: vi.fn() },
  },
}));

import { projectCompanionVouchers } from "@/lib/cashflow/companion-projection";
import { db } from "@/lib/db";

const findMany = db.companionVoucher.findMany as unknown as ReturnType<typeof vi.fn>;

const ORG = "org-1";
const START = new Date("2026-06-15T00:00:00Z");
const END = new Date("2026-09-06T00:00:00Z"); // 84 days

// Sprint 4 — the engine does TWO findMany calls in parallel:
//   1. within-cutoff (where.OR with date.gte)
//   2. older-than-cutoff (where.date.lt)
// We discriminate on the query shape so each test only needs to
// mock the within-cutoff results. Older-rows tests can override.
function mockVouchers(within: unknown[], older: unknown[] = []) {
  findMany.mockImplementation(async (args: { where: { date?: { lt?: Date }; OR?: unknown } }) => {
    if (args.where.date?.lt) return older;
    return within;
  });
}

beforeEach(() => {
  findMany.mockReset();
  // Default: nothing in either bucket. Individual tests call
  // mockVouchers(...) to seed.
  mockVouchers([], []);
});

function v(
  partial: Partial<{
    id: string;
    sourceVoucherNumber: string;
    type: "sales" | "purchase";
    date: string;
    total: number;
    paidAmount: number;
    partyName: string | null;
  }> = {}
) {
  return {
    id: partial.id ?? "v1",
    sourceVoucherNumber: partial.sourceVoucherNumber ?? "INV-001",
    type: partial.type ?? "sales",
    date: new Date(partial.date ?? "2026-06-01"),
    total: partial.total ?? 50000,
    // Sprint 4 — paidAmount defaults to 0 in production via the
    // Prisma column default; mirror that in fixtures so the
    // total-paidAmount math doesn't accidentally produce NaN.
    paidAmount: partial.paidAmount ?? 0,
    partyLedger:
      partial.partyName === null
        ? null
        : { displayName: partial.partyName ?? "Acme Corp" },
  };
}

describe("projectCompanionVouchers", () => {
  it("returns empty result when no vouchers exist", async () => {
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections).toHaveLength(0);
    expect(r.total).toBe(0);
  });

  it("projects a sales voucher as inflow at issue+30 days", async () => {
    // Issued 2026-06-10 → net-30 → projected on 2026-07-10 (local time
    // — date-fns format() reads local; toISOString() reads UTC, so we
    // use format() to match what the engine emits).
    mockVouchers([v({ date: "2026-06-10", type: "sales" })]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections).toHaveLength(1);
    expect(r.projections[0].direction).toBe("in");
    expect(format(r.projections[0].date, "yyyy-MM-dd")).toBe("2026-07-10");
    expect(r.projections[0].item.source).toBe("companion-sales");
  });

  it("projects a purchase voucher as outflow at issue+30 days", async () => {
    mockVouchers([v({ date: "2026-06-10", type: "purchase", sourceVoucherNumber: "BILL-99" })]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections[0].direction).toBe("out");
    expect(r.projections[0].item.source).toBe("companion-purchase");
  });

  it("lands past-due projections on day 0 (forecast start)", async () => {
    // Issued 60 days before forecast start → net-30 due 30 days ago →
    // should land on START
    mockVouchers([v({ date: "2026-04-16", type: "sales" })]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(format(r.projections[0].date, "yyyy-MM-dd")).toBe("2026-06-15");
  });

  it("filters within-cutoff rows by date.gte (Sprint 4 OR clause)", async () => {
    await projectCompanionVouchers(ORG, START, END);
    // Find the within-cutoff call (the one with OR clause, not date.lt).
    const withinCall = findMany.mock.calls.find(
      (c) => Array.isArray((c[0] as { where: { OR?: unknown } }).where.OR)
    );
    expect(withinCall).toBeDefined();
    const orBranches = (withinCall![0] as { where: { OR: Array<{ date?: { gte: Date } }> } }).where.OR;
    const dateBranch = orBranches.find((b) => b.date?.gte);
    const expected = new Date(START.getTime() - 90 * 86400000);
    expect(dateBranch?.date?.gte.getTime()).toBe(expected.getTime());
  });

  it("issues a second query for older rows with outstanding balance", async () => {
    await projectCompanionVouchers(ORG, START, END);
    expect(findMany).toHaveBeenCalledTimes(2);
    const olderCall = findMany.mock.calls.find(
      (c) => (c[0] as { where: { date?: { lt?: Date } } }).where.date?.lt
    );
    expect(olderCall).toBeDefined();
  });

  it("includes older outstanding rows (outside 90-day window) when they have unpaid balance", async () => {
    mockVouchers(
      [],
      [
        v({
          id: "old-unpaid",
          date: "2025-12-01", // way older than 90 days from START
          total: 5000,
          paidAmount: 1000, // 4000 still outstanding
        }),
      ]
    );
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections).toHaveLength(1);
    expect(r.projections[0].item.amount).toBe(4000); // total - paidAmount
  });

  it("excludes older rows that are fully paid (zero outstanding)", async () => {
    mockVouchers(
      [],
      [
        v({
          id: "old-paid",
          date: "2025-12-01",
          total: 5000,
          paidAmount: 5000, // fully settled
        }),
      ]
    );
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections).toHaveLength(0);
  });

  it("Sprint 4 — projects (total - paidAmount), not full total", async () => {
    mockVouchers([
      v({
        id: "partial",
        date: "2026-06-10",
        type: "sales",
        total: 10000,
        paidAmount: 3000, // 7000 still outstanding
      }),
    ]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections).toHaveLength(1);
    expect(r.projections[0].item.amount).toBe(7000);
  });

  it("Sprint 4 — excludes within-cutoff vouchers that are fully paid", async () => {
    mockVouchers([
      v({
        id: "paid",
        date: "2026-06-10",
        type: "sales",
        total: 1000,
        paidAmount: 1000,
      }),
    ]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections).toHaveLength(0);
  });

  it("filters only sales + purchase types (not receipt/payment/journal)", async () => {
    await projectCompanionVouchers(ORG, START, END);
    const call = findMany.mock.calls[0][0];
    expect(call.where.type).toEqual({ in: ["sales", "purchase"] });
  });

  it("excludes soft-deleted vouchers", async () => {
    await projectCompanionVouchers(ORG, START, END);
    const call = findMany.mock.calls[0][0];
    expect(call.where.deletedAt).toBeNull();
  });

  it("skips vouchers with non-positive total", async () => {
    mockVouchers([
      v({ id: "ok", total: 100 }),
      v({ id: "zero", total: 0 }),
      v({ id: "neg", total: -50 }),
    ]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections).toHaveLength(1);
    expect(r.projections[0].item.refId).toBe("ok");
  });

  it("skips vouchers whose projected date is past the horizon", async () => {
    // Issued at day 84 (end of horizon) → net-30 lands well past end
    const farFuture = new Date(END.getTime()).toISOString().slice(0, 10);
    mockVouchers([v({ date: farFuture, type: "sales" })]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections).toHaveLength(0);
  });

  it("labels with party name and source voucher number", async () => {
    mockVouchers([
      v({ sourceVoucherNumber: "INV-007", partyName: "Beta Corp", type: "sales" }),
    ]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections[0].item.label).toContain("INV-007");
    expect(r.projections[0].item.label).toContain("Beta Corp");
    expect(r.projections[0].item.label).toContain("Tally invoice");
  });

  it("handles vouchers with unmapped party gracefully", async () => {
    mockVouchers([
      v({ sourceVoucherNumber: "INV-X", partyName: null, type: "sales" }),
    ]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections[0].item.label).toContain("(unmapped party)");
  });

  it("returns count matching the projections array length", async () => {
    mockVouchers([
      v({ id: "v1", date: "2026-06-10", type: "sales" }),
      v({ id: "v2", date: "2026-06-12", type: "purchase" }),
      v({ id: "v3", date: "2026-06-15", type: "sales" }),
    ]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.total).toBe(r.projections.length);
    expect(r.total).toBe(3);
  });
});
