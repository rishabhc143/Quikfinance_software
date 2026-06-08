import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    invoice: { findMany: vi.fn(), findFirst: vi.fn() },
    bill: { findFirst: vi.fn() },
    recurringInvoice: { findMany: vi.fn() },
    recurringBill: { findMany: vi.fn() },
  },
}));

import { detectStaleInvoiceDraft } from "@/lib/anomaly/detectors/stale-invoice-draft";
import { detectUnusedRecurringProfile } from "@/lib/anomaly/detectors/unused-recurring-profile";
import { db } from "@/lib/db";

const invoiceFind = db.invoice.findMany as unknown as ReturnType<typeof vi.fn>;
const invoiceFirst = db.invoice.findFirst as unknown as ReturnType<typeof vi.fn>;
const billFirst = db.bill.findFirst as unknown as ReturnType<typeof vi.fn>;
const riFind = db.recurringInvoice.findMany as unknown as ReturnType<typeof vi.fn>;
const rbFind = db.recurringBill.findMany as unknown as ReturnType<typeof vi.fn>;

const ORG = "org-1";
const TODAY = new Date("2026-06-15T00:00:00Z");

beforeEach(() => {
  invoiceFind.mockReset().mockResolvedValue([]);
  invoiceFirst.mockReset().mockResolvedValue(null);
  billFirst.mockReset().mockResolvedValue(null);
  riFind.mockReset().mockResolvedValue([]);
  rbFind.mockReset().mockResolvedValue([]);
});

// ── detectStaleInvoiceDraft ──────────────────────────────────
describe("detectStaleInvoiceDraft", () => {
  it("returns empty when no stale drafts exist", async () => {
    const out = await detectStaleInvoiceDraft(ORG, TODAY);
    expect(out).toEqual([]);
  });

  it("flags a draft that's >7 days old", async () => {
    invoiceFind.mockResolvedValue([
      {
        id: "i1",
        number: "INV-DRAFT-001",
        total: 10000,
        updatedAt: new Date("2026-06-05"), // 10 days ago
        contact: { displayName: "Acme Co" },
      },
    ]);
    const out = await detectStaleInvoiceDraft(ORG, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].detectorKey).toBe("stale_invoice_draft");
    expect(out[0].severity).toBe("medium");
    expect(out[0].title).toContain("10 days");
    expect(out[0].refId).toBe("i1");
  });

  it("escalates to HIGH when draft is >30 days AND total > ₹50K", async () => {
    invoiceFind.mockResolvedValue([
      {
        id: "i-big",
        number: "INV-DRAFT-002",
        total: 100000,
        updatedAt: new Date("2026-05-01"), // 45 days ago
        contact: { displayName: "Big Co" },
      },
    ]);
    const out = await detectStaleInvoiceDraft(ORG, TODAY);
    expect(out[0].severity).toBe("high");
  });

  it("stays MEDIUM when draft is old but total below ₹50K", async () => {
    invoiceFind.mockResolvedValue([
      {
        id: "i-small",
        number: "INV-DRAFT-003",
        total: 5000,
        updatedAt: new Date("2026-05-01"),
        contact: { displayName: "Small Co" },
      },
    ]);
    const out = await detectStaleInvoiceDraft(ORG, TODAY);
    expect(out[0].severity).toBe("medium");
  });

  it("scopes query by org + status=DRAFT + soft-delete + updatedAt cutoff", async () => {
    await detectStaleInvoiceDraft(ORG, TODAY);
    const call = invoiceFind.mock.calls[0][0];
    expect(call.where.organizationId).toBe(ORG);
    expect(call.where.status).toBe("DRAFT");
    expect(call.where.deletedAt).toBeNull();
    expect(call.where.updatedAt.lt).toBeInstanceOf(Date);
  });
});

// ── detectUnusedRecurringProfile ─────────────────────────────
describe("detectUnusedRecurringProfile", () => {
  it("returns empty when no profiles exist", async () => {
    const out = await detectUnusedRecurringProfile(ORG, TODAY);
    expect(out).toEqual([]);
  });

  it("flags an Invoice profile whose last occurrence was >60 days ago", async () => {
    riFind.mockResolvedValue([
      {
        id: "p1",
        profileName: "Monthly Subscription",
        frequency: "MONTHLY",
        endDate: null,
        neverExpires: true,
        occurrencesGenerated: 5,
      },
    ]);
    invoiceFirst.mockResolvedValue({
      issueDate: new Date("2026-04-01"), // 75 days ago
    });
    const out = await detectUnusedRecurringProfile(ORG, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].detectorKey).toBe("unused_recurring_profile");
    expect(out[0].refType).toBe("recurring_invoice");
    expect(out[0].refId).toBe("p1");
    expect(out[0].title).toContain("75 days");
  });

  it("escalates to HIGH for high-frequency profiles (DAILY/WEEKLY) >90 days unused", async () => {
    riFind.mockResolvedValue([
      {
        id: "p2",
        profileName: "Daily Membership Charge",
        frequency: "DAILY",
        endDate: null,
        neverExpires: true,
        occurrencesGenerated: 100,
      },
    ]);
    invoiceFirst.mockResolvedValue({
      issueDate: new Date("2026-03-01"), // 106 days ago
    });
    const out = await detectUnusedRecurringProfile(ORG, TODAY);
    expect(out[0].severity).toBe("high");
  });

  it("stays MEDIUM for monthly profiles even when >90 days unused", async () => {
    riFind.mockResolvedValue([
      {
        id: "p3",
        profileName: "Monthly profile",
        frequency: "MONTHLY",
        endDate: null,
        neverExpires: true,
        occurrencesGenerated: 5,
      },
    ]);
    invoiceFirst.mockResolvedValue({
      issueDate: new Date("2026-03-01"),
    });
    const out = await detectUnusedRecurringProfile(ORG, TODAY);
    expect(out[0].severity).toBe("medium");
  });

  it("does NOT flag a profile that fired within the 60-day window", async () => {
    riFind.mockResolvedValue([
      {
        id: "p4",
        profileName: "Recent profile",
        frequency: "MONTHLY",
        endDate: null,
        neverExpires: true,
        occurrencesGenerated: 5,
      },
    ]);
    invoiceFirst.mockResolvedValue({
      issueDate: new Date("2026-06-01"), // 14 days ago
    });
    const out = await detectUnusedRecurringProfile(ORG, TODAY);
    expect(out).toHaveLength(0);
  });

  it("skips profiles past their endDate (legitimately finished)", async () => {
    riFind.mockResolvedValue([
      {
        id: "p5",
        profileName: "Ended Profile",
        frequency: "MONTHLY",
        endDate: new Date("2026-04-01"), // ended 75 days ago
        neverExpires: false,
        occurrencesGenerated: 5,
      },
    ]);
    invoiceFirst.mockResolvedValue({
      issueDate: new Date("2026-03-01"),
    });
    const out = await detectUnusedRecurringProfile(ORG, TODAY);
    expect(out).toHaveLength(0);
  });

  it("skips profiles with occurrencesGenerated=0 (brand new, not stale)", async () => {
    riFind.mockResolvedValue([
      {
        id: "p6",
        profileName: "Brand New Profile",
        frequency: "MONTHLY",
        endDate: null,
        neverExpires: true,
        occurrencesGenerated: 0,
      },
    ]);
    invoiceFirst.mockResolvedValue(null);
    const out = await detectUnusedRecurringProfile(ORG, TODAY);
    expect(out).toHaveLength(0);
  });

  it("checks both RecurringInvoice + RecurringBill", async () => {
    rbFind.mockResolvedValue([
      {
        id: "rb1",
        profileName: "Monthly Rent",
        frequency: "MONTHLY",
        endDate: null,
        neverExpires: true,
      },
    ]);
    billFirst.mockResolvedValue({ issueDate: new Date("2026-04-01") });
    const out = await detectUnusedRecurringProfile(ORG, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].refType).toBe("recurring_bill");
    expect(out[0].title).toContain("Bill");
  });
});
