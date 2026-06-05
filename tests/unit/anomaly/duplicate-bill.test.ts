import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    bill: { findMany: vi.fn() },
  },
}));

import { detectDuplicateBills } from "@/lib/anomaly/detectors/duplicate-bill";
import { db } from "@/lib/db";

const findMany = db.bill.findMany as unknown as ReturnType<typeof vi.fn>;

type BillFixture = {
  id: string;
  number: string;
  contactId: string | null;
  issueDate: Date;
  total: number;
  currency: string;
  contact: { displayName: string } | null;
};

function bill(
  id: string,
  contactId: string | null,
  isoDate: string,
  total: number,
  number = id.toUpperCase(),
  displayName = "Acme Vendor"
): BillFixture {
  return {
    id,
    number,
    contactId,
    issueDate: new Date(isoDate),
    total,
    currency: "INR",
    contact: contactId ? { displayName } : null,
  };
}

const ORG = "org-1";
const TODAY = new Date("2026-06-15");

describe("detectDuplicateBills", () => {
  beforeEach(() => findMany.mockReset());

  it("returns empty when no bills exist", async () => {
    findMany.mockResolvedValue([]);
    const out = await detectDuplicateBills(ORG, TODAY);
    expect(out).toEqual([]);
  });

  it("flags two bills with same vendor + same amount within 7 days", async () => {
    findMany.mockResolvedValue([
      bill("b1", "vendor-1", "2026-06-10", 5000),
      bill("b2", "vendor-1", "2026-06-13", 5000),
    ]);
    const out = await detectDuplicateBills(ORG, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].severity).toBe("high");
    expect(out[0].detectorKey).toBe("duplicate_bill");
    expect(out[0].refType).toBe("bill");
    expect(out[0].title).toContain("Acme Vendor");
  });

  it("does NOT flag bills with the same vendor + amount BEYOND the 7-day window", async () => {
    findMany.mockResolvedValue([
      bill("b1", "vendor-1", "2026-06-01", 5000),
      bill("b2", "vendor-1", "2026-06-10", 5000), // 9 days apart
    ]);
    const out = await detectDuplicateBills(ORG, TODAY);
    expect(out).toHaveLength(0);
  });

  it("does NOT flag bills with the same amount but different vendors", async () => {
    findMany.mockResolvedValue([
      bill("b1", "vendor-1", "2026-06-10", 5000),
      bill("b2", "vendor-2", "2026-06-12", 5000),
    ]);
    const out = await detectDuplicateBills(ORG, TODAY);
    expect(out).toHaveLength(0);
  });

  it("does NOT flag bills with the same vendor but different amounts", async () => {
    findMany.mockResolvedValue([
      bill("b1", "vendor-1", "2026-06-10", 5000),
      bill("b2", "vendor-1", "2026-06-12", 5001),
    ]);
    const out = await detectDuplicateBills(ORG, TODAY);
    expect(out).toHaveLength(0);
  });

  it("skips bills without a contactId (cannot be duplicates without a vendor)", async () => {
    findMany.mockResolvedValue([
      bill("b1", null, "2026-06-10", 5000),
      bill("b2", null, "2026-06-12", 5000),
    ]);
    const out = await detectDuplicateBills(ORG, TODAY);
    expect(out).toHaveLength(0);
  });

  it("produces an order-invariant fingerprint", async () => {
    findMany.mockResolvedValue([
      bill("zzz", "vendor-1", "2026-06-10", 5000),
      bill("aaa", "vendor-1", "2026-06-12", 5000),
    ]);
    const out = await detectDuplicateBills(ORG, TODAY);
    // Fingerprint should sort ids — same regardless of input order.
    expect(out[0].fingerprint).toBe("duplicate_bill:aaa|zzz");
  });

  it("filters via Prisma where clause — verifies status & deletedAt scoping", async () => {
    findMany.mockResolvedValue([]);
    await detectDuplicateBills(ORG, TODAY);
    const call = findMany.mock.calls[0][0];
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.deletedAt).toBeNull();
    expect(call.where.status).toEqual({
      in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"],
    });
  });

  it("includes both bill numbers + dates in the description", async () => {
    findMany.mockResolvedValue([
      bill("b1", "vendor-1", "2026-06-10", 5000, "BILL-100"),
      bill("b2", "vendor-1", "2026-06-13", 5000, "BILL-105"),
    ]);
    const out = await detectDuplicateBills(ORG, TODAY);
    expect(out[0].description).toContain("BILL-100");
    expect(out[0].description).toContain("BILL-105");
    expect(out[0].description).toContain("2026-06-10");
    expect(out[0].description).toContain("2026-06-13");
  });

  it("flags adjacent duplicates within a sequence", async () => {
    // Three bills in sequence: b1-b2 within window, b2-b3 within window
    findMany.mockResolvedValue([
      bill("b1", "v1", "2026-06-01", 5000),
      bill("b2", "v1", "2026-06-05", 5000),
      bill("b3", "v1", "2026-06-09", 5000),
    ]);
    const out = await detectDuplicateBills(ORG, TODAY);
    // Adjacent-only sweep — flags b1↔b2 and b2↔b3
    expect(out).toHaveLength(2);
  });
});
