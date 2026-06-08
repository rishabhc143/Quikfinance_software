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

beforeEach(() => findMany.mockReset().mockResolvedValue([]));

function v(
  partial: Partial<{
    id: string;
    sourceVoucherNumber: string;
    type: "sales" | "purchase";
    date: string;
    total: number;
    partyName: string | null;
  }> = {}
) {
  return {
    id: partial.id ?? "v1",
    sourceVoucherNumber: partial.sourceVoucherNumber ?? "INV-001",
    type: partial.type ?? "sales",
    date: new Date(partial.date ?? "2026-06-01"),
    total: partial.total ?? 50000,
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
    findMany.mockResolvedValue([v({ date: "2026-06-10", type: "sales" })]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections).toHaveLength(1);
    expect(r.projections[0].direction).toBe("in");
    expect(format(r.projections[0].date, "yyyy-MM-dd")).toBe("2026-07-10");
    expect(r.projections[0].item.source).toBe("companion-sales");
  });

  it("projects a purchase voucher as outflow at issue+30 days", async () => {
    findMany.mockResolvedValue([v({ date: "2026-06-10", type: "purchase", sourceVoucherNumber: "BILL-99" })]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections[0].direction).toBe("out");
    expect(r.projections[0].item.source).toBe("companion-purchase");
  });

  it("lands past-due projections on day 0 (forecast start)", async () => {
    // Issued 60 days before forecast start → net-30 due 30 days ago →
    // should land on START
    findMany.mockResolvedValue([v({ date: "2026-04-16", type: "sales" })]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(format(r.projections[0].date, "yyyy-MM-dd")).toBe("2026-06-15");
  });

  it("excludes vouchers older than the 90-day cutoff (DB query filter)", async () => {
    await projectCompanionVouchers(ORG, START, END);
    const call = findMany.mock.calls[0][0];
    // cutoff should be 90 days before START
    const cutoff = call.where.date.gte;
    const expected = new Date(START.getTime() - 90 * 86400000);
    expect(cutoff.getTime()).toBe(expected.getTime());
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
    findMany.mockResolvedValue([
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
    findMany.mockResolvedValue([v({ date: farFuture, type: "sales" })]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections).toHaveLength(0);
  });

  it("labels with party name and source voucher number", async () => {
    findMany.mockResolvedValue([
      v({ sourceVoucherNumber: "INV-007", partyName: "Beta Corp", type: "sales" }),
    ]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections[0].item.label).toContain("INV-007");
    expect(r.projections[0].item.label).toContain("Beta Corp");
    expect(r.projections[0].item.label).toContain("Tally invoice");
  });

  it("handles vouchers with unmapped party gracefully", async () => {
    findMany.mockResolvedValue([
      v({ sourceVoucherNumber: "INV-X", partyName: null, type: "sales" }),
    ]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.projections[0].item.label).toContain("(unmapped party)");
  });

  it("returns count matching the projections array length", async () => {
    findMany.mockResolvedValue([
      v({ id: "v1", date: "2026-06-10", type: "sales" }),
      v({ id: "v2", date: "2026-06-12", type: "purchase" }),
      v({ id: "v3", date: "2026-06-15", type: "sales" }),
    ]);
    const r = await projectCompanionVouchers(ORG, START, END);
    expect(r.total).toBe(r.projections.length);
    expect(r.total).toBe(3);
  });
});
