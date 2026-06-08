import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    invoice: { findMany: vi.fn() },
    bill: { findMany: vi.fn() },
    bankAccount: { findMany: vi.fn() },
    bankTransaction: { findMany: vi.fn() },
    contact: { findMany: vi.fn() },
    paymentReceivedAllocation: { findMany: vi.fn() },
  },
}));

import { detectBalanceDrop } from "@/lib/anomaly/detectors/balance-drop";
import { detectGstinMismatch } from "@/lib/anomaly/detectors/gstin-mismatch";
import { detectOverdueJump } from "@/lib/anomaly/detectors/overdue-jump";
import { detectVendorConcentration } from "@/lib/anomaly/detectors/vendor-concentration";
import { db } from "@/lib/db";

const invoiceFind = db.invoice.findMany as unknown as ReturnType<typeof vi.fn>;
const billFind = db.bill.findMany as unknown as ReturnType<typeof vi.fn>;
const bankFind = db.bankAccount.findMany as unknown as ReturnType<typeof vi.fn>;
const txnFind = db.bankTransaction.findMany as unknown as ReturnType<typeof vi.fn>;
const contactFind = db.contact.findMany as unknown as ReturnType<typeof vi.fn>;
const allocFind = db.paymentReceivedAllocation.findMany as unknown as ReturnType<typeof vi.fn>;

const ORG = "org-1";
const TODAY = new Date("2026-06-15T00:00:00Z");

beforeEach(() => {
  invoiceFind.mockReset().mockResolvedValue([]);
  billFind.mockReset().mockResolvedValue([]);
  bankFind.mockReset().mockResolvedValue([]);
  txnFind.mockReset().mockResolvedValue([]);
  contactFind.mockReset().mockResolvedValue([]);
  allocFind.mockReset().mockResolvedValue([]);
});

// ── detectOverdueJump ──────────────────────────────────────────
describe("detectOverdueJump", () => {
  it("returns empty when no invoices exist", async () => {
    const out = await detectOverdueJump(ORG, TODAY);
    expect(out).toEqual([]);
  });

  it("flags a customer whose outstanding jumped >50% week-over-week", async () => {
    // Current: 1 open invoice for ₹2L outstanding.
    invoiceFind
      .mockResolvedValueOnce([
        {
          contactId: "c1",
          total: 200000,
          amountPaid: 0,
          contact: { displayName: "Acme Corp" },
        },
      ])
      // Last week's invoices: same invoice but with paidThisWeek=0
      // so it WAS at this amount last week — no jump.
      .mockResolvedValueOnce([]);
    const out = await detectOverdueJump(ORG, TODAY);
    // Last week = 0, current = 200000 → ∞% jump, ≥ ₹50K → fires.
    expect(out).toHaveLength(1);
    expect(out[0].detectorKey).toBe("overdue_jump");
    expect(out[0].refId).toBe("c1");
  });

  it("skips when absolute jump is below the ₹50K floor", async () => {
    invoiceFind
      .mockResolvedValueOnce([
        {
          contactId: "c1",
          total: 30000,
          amountPaid: 0,
          contact: { displayName: "Small Co" },
        },
      ])
      .mockResolvedValueOnce([]);
    const out = await detectOverdueJump(ORG, TODAY);
    expect(out).toHaveLength(0);
  });

  it("escalates severity to high when current > ₹5L AND jump > 100%", async () => {
    invoiceFind
      .mockResolvedValueOnce([
        {
          contactId: "c1",
          total: 800000,
          amountPaid: 0,
          contact: { displayName: "Big Co" },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "i-old",
          contactId: "c1",
          total: 200000,
          amountPaid: 0,
        },
      ]);
    const out = await detectOverdueJump(ORG, TODAY);
    expect(out[0].severity).toBe("high");
  });
});

// ── detectBalanceDrop ──────────────────────────────────────────
describe("detectBalanceDrop", () => {
  it("returns empty when no banks exist", async () => {
    const out = await detectBalanceDrop(ORG, TODAY);
    expect(out).toEqual([]);
  });

  it("flags a >30% week-over-week drop above the ₹1L absolute floor", async () => {
    bankFind.mockResolvedValue([
      { id: "b1", name: "HDFC Current", openingBalance: 1000000 },
    ]);
    // Last week: 1M opening + 0 = 1M balance
    // This week: 1M opening + (-500K debit) = 500K balance
    // Drop: 500K (50%), passes floor + pct
    txnFind.mockResolvedValue([
      {
        amount: 500000,
        type: "DEBIT",
        date: new Date("2026-06-14"), // after weekAgo (2026-06-08)
      },
    ]);
    const out = await detectBalanceDrop(ORG, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].detectorKey).toBe("balance_drop");
    expect(out[0].refId).toBe("b1");
  });

  it("escalates severity to high when balance goes negative", async () => {
    bankFind.mockResolvedValue([
      { id: "b1", name: "HDFC Current", openingBalance: 200000 },
    ]);
    txnFind.mockResolvedValue([
      { amount: 500000, type: "DEBIT", date: new Date("2026-06-14") },
    ]);
    const out = await detectBalanceDrop(ORG, TODAY);
    expect(out[0].severity).toBe("high");
  });

  it("does not fire when drop is below the 30% threshold", async () => {
    bankFind.mockResolvedValue([
      { id: "b1", name: "HDFC", openingBalance: 1000000 },
    ]);
    txnFind.mockResolvedValue([
      { amount: 150000, type: "DEBIT", date: new Date("2026-06-14") },
    ]);
    // Drop: 150K (15%) — below 30% threshold despite passing ₹1L floor
    const out = await detectBalanceDrop(ORG, TODAY);
    expect(out).toHaveLength(0);
  });
});

// ── detectVendorConcentration ──────────────────────────────────
describe("detectVendorConcentration", () => {
  it("returns empty when total AP is below the ₹2L floor", async () => {
    billFind.mockResolvedValue([
      {
        contactId: "v1",
        total: 100000,
        amountPaid: 0,
        contact: { displayName: "Vendor A" },
      },
    ]);
    const out = await detectVendorConcentration(ORG, TODAY);
    expect(out).toHaveLength(0);
  });

  it("flags a vendor with >50% of AP", async () => {
    billFind.mockResolvedValue([
      {
        contactId: "v1",
        total: 400000,
        amountPaid: 0,
        contact: { displayName: "Big Vendor" },
      },
      {
        contactId: "v2",
        total: 200000,
        amountPaid: 0,
        contact: { displayName: "Other Vendor" },
      },
    ]);
    const out = await detectVendorConcentration(ORG, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].refId).toBe("v1");
    expect(out[0].severity).toBe("medium"); // 67% concentration
  });

  it("escalates to high when concentration is >75%", async () => {
    billFind.mockResolvedValue([
      {
        contactId: "v1",
        total: 900000,
        amountPaid: 0,
        contact: { displayName: "Dominant Vendor" },
      },
      {
        contactId: "v2",
        total: 100000,
        amountPaid: 0,
        contact: { displayName: "Small Vendor" },
      },
    ]);
    const out = await detectVendorConcentration(ORG, TODAY);
    expect(out[0].severity).toBe("high");
  });

  it("ignores bills without a contactId (orphaned)", async () => {
    billFind.mockResolvedValue([
      {
        contactId: null,
        total: 1000000,
        amountPaid: 0,
        contact: null,
      },
    ]);
    const out = await detectVendorConcentration(ORG, TODAY);
    expect(out).toHaveLength(0);
  });
});

// ── detectGstinMismatch ────────────────────────────────────────
describe("detectGstinMismatch", () => {
  it("returns empty when no contacts have both GSTIN + placeOfSupply", async () => {
    const out = await detectGstinMismatch(ORG, TODAY);
    expect(out).toEqual([]);
  });

  it("flags a contact whose GSTIN state-code disagrees with placeOfSupply", async () => {
    contactFind.mockResolvedValue([
      {
        id: "c1",
        displayName: "Mumbai Acme",
        gstin: "29ABCDE1234F1Z5", // 29 = Karnataka
        placeOfSupply: "Maharashtra", // declared mismatched state
      },
    ]);
    const out = await detectGstinMismatch(ORG, TODAY);
    expect(out).toHaveLength(1);
    expect(out[0].detectorKey).toBe("gstin_mismatch");
    expect(out[0].severity).toBe("medium");
    expect(out[0].description).toMatch(/karnataka/i);
    expect(out[0].description).toMatch(/maharashtra/i);
  });

  it("does NOT flag when GSTIN state matches placeOfSupply", async () => {
    contactFind.mockResolvedValue([
      {
        id: "c1",
        displayName: "Bangalore Co",
        gstin: "29ABCDE1234F1Z5", // 29 = Karnataka
        placeOfSupply: "Karnataka",
      },
    ]);
    const out = await detectGstinMismatch(ORG, TODAY);
    expect(out).toHaveLength(0);
  });

  it("does NOT flag malformed GSTINs (those are a separate issue)", async () => {
    contactFind.mockResolvedValue([
      {
        id: "c1",
        displayName: "Bad GSTIN Co",
        gstin: "INVALID",
        placeOfSupply: "Karnataka",
      },
    ]);
    const out = await detectGstinMismatch(ORG, TODAY);
    expect(out).toHaveLength(0);
  });

  it("normalises case + whitespace when matching state names", async () => {
    contactFind.mockResolvedValue([
      {
        id: "c1",
        displayName: "Acme",
        gstin: "27ABCDE1234F1Z5", // 27 = Maharashtra
        placeOfSupply: "  maharashtra  ", // whitespace + lowercase
      },
    ]);
    const out = await detectGstinMismatch(ORG, TODAY);
    expect(out).toHaveLength(0);
  });
});
