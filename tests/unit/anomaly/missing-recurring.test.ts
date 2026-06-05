import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    recurringInvoice: { findMany: vi.fn() },
    recurringBill: { findMany: vi.fn() },
    recurringExpense: { findMany: vi.fn() },
  },
}));

import { detectMissingRecurring } from "@/lib/anomaly/detectors/missing-recurring";
import { db } from "@/lib/db";

const ri = db.recurringInvoice.findMany as unknown as ReturnType<typeof vi.fn>;
const rb = db.recurringBill.findMany as unknown as ReturnType<typeof vi.fn>;
const re = db.recurringExpense.findMany as unknown as ReturnType<typeof vi.fn>;

const ORG = "org-1";
const TODAY = new Date("2026-06-15");

beforeEach(() => {
  ri.mockReset().mockResolvedValue([]);
  rb.mockReset().mockResolvedValue([]);
  re.mockReset().mockResolvedValue([]);
});

function profile(
  id: string,
  profileName: string,
  nextOccurrenceDate: Date | null,
  nextRunAt: Date
) {
  return { id, profileName, nextOccurrenceDate, nextRunAt };
}

describe("detectMissingRecurring", () => {
  it("returns empty when no overdue profiles exist", async () => {
    const out = await detectMissingRecurring(ORG, TODAY);
    expect(out).toEqual([]);
  });

  it("flags a recurring INVOICE whose nextOccurrenceDate is 10 days overdue", async () => {
    const tenDaysAgo = new Date(TODAY.getTime() - 10 * 86400000);
    ri.mockResolvedValue([
      profile("p1", "Acme Monthly Subscription", tenDaysAgo, tenDaysAgo),
    ]);
    const out = await detectMissingRecurring(ORG, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].detectorKey).toBe("missing_recurring");
    expect(out[0].refType).toBe("recurring_invoice");
    expect(out[0].refId).toBe("p1");
    expect(out[0].severity).toBe("medium"); // <14 days
    expect(out[0].title).toContain("10 days overdue");
  });

  it("graduates severity to HIGH when 15+ days overdue", async () => {
    const fifteenDaysAgo = new Date(TODAY.getTime() - 15 * 86400000);
    ri.mockResolvedValue([
      profile("p1", "Late profile", fifteenDaysAgo, fifteenDaysAgo),
    ]);
    const out = await detectMissingRecurring(ORG, TODAY);
    expect(out[0].severity).toBe("high");
  });

  it("flags a recurring BILL", async () => {
    const tenDaysAgo = new Date(TODAY.getTime() - 10 * 86400000);
    rb.mockResolvedValue([
      profile("b1", "Office rent", tenDaysAgo, tenDaysAgo),
    ]);
    const out = await detectMissingRecurring(ORG, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].refType).toBe("recurring_bill");
    expect(out[0].title).toContain("Bill");
  });

  it("flags a recurring EXPENSE", async () => {
    const tenDaysAgo = new Date(TODAY.getTime() - 10 * 86400000);
    re.mockResolvedValue([
      profile("e1", "Cleaning service", tenDaysAgo, tenDaysAgo),
    ]);
    const out = await detectMissingRecurring(ORG, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].refType).toBe("recurring_expense");
    expect(out[0].title).toContain("Expense");
  });

  it("aggregates across all three tables", async () => {
    const ago = new Date(TODAY.getTime() - 5 * 86400000);
    ri.mockResolvedValue([profile("p1", "Inv profile", ago, ago)]);
    rb.mockResolvedValue([profile("b1", "Bill profile", ago, ago)]);
    re.mockResolvedValue([profile("e1", "Exp profile", ago, ago)]);
    const out = await detectMissingRecurring(ORG, TODAY);
    expect(out).toHaveLength(3);
  });

  it("filters Prisma query by org + active + deletedAt + cutoff", async () => {
    await detectMissingRecurring(ORG, TODAY);
    const riCall = ri.mock.calls[0][0];
    expect(riCall.where.organizationId).toBe(ORG);
    expect(riCall.where.status).toBe("ACTIVE");
    expect(riCall.where.deletedAt).toBeNull();
    // RecurringInvoice.nextOccurrenceDate is non-nullable, so the
    // query uses a plain lt-filter rather than an OR-with-nextRunAt.
    expect(riCall.where.nextOccurrenceDate).toBeDefined();
    expect(riCall.where.nextOccurrenceDate.lt).toBeInstanceOf(Date);
    // Cutoff is exactly 2 days before TODAY (the threshold).
    const expectedCutoff = TODAY.getTime() - 2 * 86400000;
    expect(riCall.where.nextOccurrenceDate.lt.getTime()).toBe(expectedCutoff);

    // RecurringBill + RecurringExpense KEEP the OR-with-nextRunAt
    // because their nextOccurrenceDate is nullable on legacy rows.
    const rbCall = rb.mock.calls[0][0];
    expect(rbCall.where.OR).toBeDefined();
    expect(Array.isArray(rbCall.where.OR)).toBe(true);
  });

  it("uses nextOccurrenceDate when present, falls back to nextRunAt", async () => {
    const tenDaysAgo = new Date(TODAY.getTime() - 10 * 86400000);
    const fifteenDaysAgo = new Date(TODAY.getTime() - 15 * 86400000);
    // p1: nextOccurrenceDate=10d ago (overrides nextRunAt=15d)
    ri.mockResolvedValue([profile("p1", "P1", tenDaysAgo, fifteenDaysAgo)]);
    const out = await detectMissingRecurring(ORG, TODAY);
    expect(out[0].severity).toBe("medium"); // 10 days = medium
    expect(out[0].title).toContain("10 days");
  });

  it("produces deterministic fingerprint per profile id", async () => {
    const ago = new Date(TODAY.getTime() - 10 * 86400000);
    ri.mockResolvedValue([profile("xyz", "Profile XYZ", ago, ago)]);
    const out = await detectMissingRecurring(ORG, TODAY);
    expect(out[0].fingerprint).toBe("missing_recurring:xyz");
  });
});
