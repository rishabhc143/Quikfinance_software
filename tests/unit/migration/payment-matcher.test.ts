import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    companionVoucher: {
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { runPaymentMatcher } from "@/lib/migration/payment-matcher";
import { db } from "@/lib/db";

const findMany = db.companionVoucher.findMany as unknown as ReturnType<typeof vi.fn>;
const update = db.companionVoucher.update as unknown as ReturnType<typeof vi.fn>;

const ORG = "org-1";

function vch(
  partial: Partial<{
    id: string;
    type: "sales" | "purchase" | "receipt" | "payment";
    date: string;
    total: number;
    paidAmount: number;
    partyLedgerId: string | null;
  }> = {}
) {
  return {
    id: partial.id ?? "v1",
    type: partial.type ?? "sales",
    date: new Date(partial.date ?? "2026-06-01"),
    total: { toString: () => String(partial.total ?? 1000) },
    paidAmount: { toString: () => String(partial.paidAmount ?? 0) },
    partyLedgerId: partial.partyLedgerId === undefined ? "p1" : partial.partyLedgerId,
  };
}

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  update.mockReset().mockResolvedValue({});
});

describe("runPaymentMatcher — happy path", () => {
  it("pays a single Sales voucher fully when a matching Receipt covers it", async () => {
    findMany.mockResolvedValue([
      vch({ id: "s1", type: "sales", date: "2026-06-01", total: 1000, partyLedgerId: "p1" }),
      vch({ id: "r1", type: "receipt", date: "2026-06-05", total: 1000, partyLedgerId: "p1" }),
    ]);
    const stats = await runPaymentMatcher(ORG);
    expect(stats.vouchersUpdated).toBe(1);
    expect(stats.totalCashApplied).toBe(1000);
    expect(stats.unmatchedCash).toBe(0);
    const arg = update.mock.calls[0][0];
    expect(arg.where.id).toBe("s1");
    expect(arg.data.paidAmount).toBe("1000.0000");
  });

  it("FIFO — oldest Sales gets paid first", async () => {
    findMany.mockResolvedValue([
      vch({ id: "s1", type: "sales", date: "2026-06-01", total: 500, partyLedgerId: "p1" }),
      vch({ id: "s2", type: "sales", date: "2026-06-05", total: 500, partyLedgerId: "p1" }),
      vch({ id: "r1", type: "receipt", date: "2026-06-10", total: 500, partyLedgerId: "p1" }),
    ]);
    await runPaymentMatcher(ORG);
    // s1 should be fully paid; s2 untouched
    const updatedIds = update.mock.calls.map((c) => c[0].where.id);
    expect(updatedIds).toContain("s1");
    expect(updatedIds).not.toContain("s2");
  });

  it("partial payment populates paidAmount with the partial amount", async () => {
    findMany.mockResolvedValue([
      vch({ id: "s1", type: "sales", date: "2026-06-01", total: 1000, partyLedgerId: "p1" }),
      vch({ id: "r1", type: "receipt", date: "2026-06-05", total: 400, partyLedgerId: "p1" }),
    ]);
    await runPaymentMatcher(ORG);
    const arg = update.mock.calls[0][0];
    expect(arg.data.paidAmount).toBe("400.0000");
  });

  it("rolls surplus from one receipt onto the next Sales voucher", async () => {
    findMany.mockResolvedValue([
      vch({ id: "s1", type: "sales", date: "2026-06-01", total: 300, partyLedgerId: "p1" }),
      vch({ id: "s2", type: "sales", date: "2026-06-05", total: 400, partyLedgerId: "p1" }),
      vch({ id: "r1", type: "receipt", date: "2026-06-10", total: 500, partyLedgerId: "p1" }),
    ]);
    await runPaymentMatcher(ORG);
    // s1 fully paid (300), s2 partially paid (200)
    const calls = update.mock.calls.map((c) => ({
      id: c[0].where.id,
      paid: c[0].data.paidAmount,
    }));
    expect(calls).toContainEqual({ id: "s1", paid: "300.0000" });
    expect(calls).toContainEqual({ id: "s2", paid: "200.0000" });
  });
});

describe("runPaymentMatcher — isolation", () => {
  it("does NOT cross parties (Acme receipt cannot pay Beta's invoice)", async () => {
    findMany.mockResolvedValue([
      vch({ id: "acme_inv", type: "sales", date: "2026-06-01", total: 1000, partyLedgerId: "acme" }),
      vch({ id: "beta_rct", type: "receipt", date: "2026-06-05", total: 1000, partyLedgerId: "beta" }),
    ]);
    const stats = await runPaymentMatcher(ORG);
    expect(stats.vouchersUpdated).toBe(0);
    expect(stats.unmatchedCash).toBe(1000);
  });

  it("does NOT cross AR/AP sides (Receipt cannot pay a Purchase)", async () => {
    findMany.mockResolvedValue([
      vch({ id: "purch", type: "purchase", date: "2026-06-01", total: 1000, partyLedgerId: "p1" }),
      vch({ id: "rcpt", type: "receipt", date: "2026-06-05", total: 1000, partyLedgerId: "p1" }),
    ]);
    // Receipt only matches Sales; Purchase needs Payment.
    const stats = await runPaymentMatcher(ORG);
    expect(stats.vouchersUpdated).toBe(0);
  });

  it("Payment correctly pays a Purchase from the same party", async () => {
    findMany.mockResolvedValue([
      vch({ id: "purch", type: "purchase", date: "2026-06-01", total: 1000, partyLedgerId: "p1" }),
      vch({ id: "pmt", type: "payment", date: "2026-06-05", total: 1000, partyLedgerId: "p1" }),
    ]);
    const stats = await runPaymentMatcher(ORG);
    expect(stats.vouchersUpdated).toBe(1);
    expect(stats.totalCashApplied).toBe(1000);
  });
});

describe("runPaymentMatcher — caps + unmatched", () => {
  it("caps paidAmount at total (no overpay)", async () => {
    findMany.mockResolvedValue([
      vch({ id: "s1", type: "sales", date: "2026-06-01", total: 500, partyLedgerId: "p1" }),
      vch({ id: "r1", type: "receipt", date: "2026-06-05", total: 1000, partyLedgerId: "p1" }), // 2x overpay
    ]);
    const stats = await runPaymentMatcher(ORG);
    // 500 applied to s1; remaining 500 is unmatched
    expect(stats.totalCashApplied).toBe(500);
    expect(stats.unmatchedCash).toBe(500);
    const arg = update.mock.calls[0][0];
    expect(arg.data.paidAmount).toBe("500.0000");
  });

  it("reports unmatched cash when no open vouchers exist for a party", async () => {
    findMany.mockResolvedValue([
      vch({ id: "r1", type: "receipt", date: "2026-06-05", total: 1000, partyLedgerId: "p1" }),
    ]);
    const stats = await runPaymentMatcher(ORG);
    expect(stats.vouchersUpdated).toBe(0);
    expect(stats.unmatchedCash).toBe(1000);
  });

  it("skips vouchers without partyLedgerId via DB filter", async () => {
    await runPaymentMatcher(ORG);
    const call = findMany.mock.calls[0][0];
    expect(call.where.partyLedgerId).toEqual({ not: null });
  });

  it("filters by org + deletedAt is null + valid type", async () => {
    await runPaymentMatcher(ORG);
    const call = findMany.mock.calls[0][0];
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.deletedAt).toBeNull();
    expect(call.where.type).toEqual({ in: ["sales", "purchase", "receipt", "payment"] });
  });
});

describe("runPaymentMatcher — idempotency", () => {
  it("does NOT call update when paidAmount is already correct", async () => {
    findMany.mockResolvedValue([
      vch({ id: "s1", type: "sales", date: "2026-06-01", total: 1000, paidAmount: 1000, partyLedgerId: "p1" }),
      vch({ id: "r1", type: "receipt", date: "2026-06-05", total: 1000, partyLedgerId: "p1" }),
    ]);
    const stats = await runPaymentMatcher(ORG);
    // The matcher computes paidAmount=1000 which equals the existing
    // value — should skip the update call.
    expect(stats.vouchersUpdated).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it("re-running yields stable results (no drift)", async () => {
    findMany.mockResolvedValue([
      vch({ id: "s1", type: "sales", date: "2026-06-01", total: 1000, paidAmount: 500, partyLedgerId: "p1" }),
      vch({ id: "r1", type: "receipt", date: "2026-06-05", total: 500, partyLedgerId: "p1" }),
    ]);
    // First run: paid=500 already matches what the matcher would
    // produce (500 of receipt applied). So no update.
    const stats = await runPaymentMatcher(ORG);
    expect(stats.vouchersUpdated).toBe(0);
  });
});
