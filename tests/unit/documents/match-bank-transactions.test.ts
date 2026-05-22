import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the db before importing the module under test.
vi.mock("@/lib/db", () => {
  return {
    db: {
      invoice: { findMany: vi.fn() },
      bill: { findMany: vi.fn() },
    },
  };
});

import { suggestMatchesForBankRows } from "@/lib/documents/match-bank-transactions";
import { db } from "@/lib/db";

const mockedInvoiceFindMany = db.invoice.findMany as unknown as ReturnType<typeof vi.fn>;
const mockedBillFindMany = db.bill.findMany as unknown as ReturnType<typeof vi.fn>;

function invoice(overrides: Partial<{
  id: string;
  number: string;
  total: number;
  amountPaid: number;
  issueDate: string;
  dueDate: string;
  status: string;
  displayName: string;
}> = {}) {
  return {
    id: overrides.id ?? "inv-1",
    number: overrides.number ?? "INV-001",
    total: overrides.total ?? 50000,
    amountPaid: overrides.amountPaid ?? 0,
    issueDate: new Date(overrides.issueDate ?? "2026-04-01"),
    dueDate: new Date(overrides.dueDate ?? "2026-05-01"),
    status: overrides.status ?? "SENT",
    contact: { displayName: overrides.displayName ?? "Acme Holdings" },
  };
}

function bill(overrides: Partial<{
  id: string;
  number: string;
  total: number;
  amountPaid: number;
  issueDate: string;
  dueDate: string;
  status: string;
  displayName: string;
}> = {}) {
  return {
    id: overrides.id ?? "bill-1",
    number: overrides.number ?? "BILL-005",
    total: overrides.total ?? 15000,
    amountPaid: overrides.amountPaid ?? 0,
    issueDate: new Date(overrides.issueDate ?? "2026-04-10"),
    dueDate: new Date(overrides.dueDate ?? "2026-05-10"),
    status: overrides.status ?? "OPEN",
    contact: { displayName: overrides.displayName ?? "Office Supplies Co" },
  };
}

describe("documents/match-bank-transactions", () => {
  beforeEach(() => {
    mockedInvoiceFindMany.mockReset();
    mockedBillFindMany.mockReset();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("matches a credit row to an outstanding invoice with exact amount + recent date", async () => {
    mockedInvoiceFindMany.mockResolvedValue([invoice()]);
    mockedBillFindMany.mockResolvedValue([]);

    const result = await suggestMatchesForBankRows({
      organizationId: "org-1",
      rows: [
        { date: "2026-04-25", credit: 50000, description: "NEFT from Acme" },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].entityType).toBe("INVOICE");
    expect(result[0].entity.number).toBe("INV-001");
    expect(result[0].entity.counterpartyName).toBe("Acme Holdings");
    expect(result[0].confidence).toBe(100);
    expect(result[0].reason.toLowerCase()).toContain("exact");
  });

  it("matches a debit row to an outstanding bill", async () => {
    mockedInvoiceFindMany.mockResolvedValue([]);
    mockedBillFindMany.mockResolvedValue([bill()]);

    const result = await suggestMatchesForBankRows({
      organizationId: "org-1",
      rows: [
        { date: "2026-04-30", debit: 15000, description: "RTGS to vendor" },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0].entityType).toBe("BILL");
    expect(result[0].entity.number).toBe("BILL-005");
    expect(result[0].confidence).toBe(100);
  });

  it("matches within tolerance (≤ ₹1 diff)", async () => {
    mockedInvoiceFindMany.mockResolvedValue([invoice({ total: 50000.5 })]);
    mockedBillFindMany.mockResolvedValue([]);

    const result = await suggestMatchesForBankRows({
      organizationId: "org-1",
      rows: [
        { date: "2026-04-25", credit: 50000, description: "x" },
      ],
    });

    expect(result).toHaveLength(1);
    // 50000 vs 50000.50 — within ₹1 → still counts as exact.
    expect(result[0].confidence).toBe(100);
  });

  it("matches close amount within 2% tolerance with lower confidence", async () => {
    // Invoice 50000, paid 0, outstanding 50000. Row 51000 = 2% off.
    mockedInvoiceFindMany.mockResolvedValue([invoice()]);
    mockedBillFindMany.mockResolvedValue([]);

    const result = await suggestMatchesForBankRows({
      organizationId: "org-1",
      rows: [
        { date: "2026-04-25", credit: 51000, description: "x" },
      ],
    });

    expect(result).toHaveLength(1);
    // Close match (not exact) → confidence ≤ 60
    expect(result[0].confidence).toBeLessThan(80);
  });

  it("excludes already-paid invoices (outstanding 0)", async () => {
    mockedInvoiceFindMany.mockResolvedValue([
      invoice({ total: 50000, amountPaid: 50000 }),
    ]);
    mockedBillFindMany.mockResolvedValue([]);

    const result = await suggestMatchesForBankRows({
      organizationId: "org-1",
      rows: [
        { date: "2026-04-25", credit: 50000, description: "x" },
      ],
    });
    expect(result).toEqual([]);
  });

  it("excludes invoices issued AFTER the bank row date", async () => {
    mockedInvoiceFindMany.mockResolvedValue([
      invoice({ issueDate: "2026-05-15" }),
    ]);
    mockedBillFindMany.mockResolvedValue([]);

    const result = await suggestMatchesForBankRows({
      organizationId: "org-1",
      rows: [
        { date: "2026-04-25", credit: 50000, description: "x" },
      ],
    });
    expect(result).toEqual([]);
  });

  it("excludes invoices outside the lookback window (>60 days)", async () => {
    mockedInvoiceFindMany.mockResolvedValue([
      invoice({ issueDate: "2026-01-01" }),
    ]);
    mockedBillFindMany.mockResolvedValue([]);

    const result = await suggestMatchesForBankRows({
      organizationId: "org-1",
      rows: [
        { date: "2026-04-25", credit: 50000, description: "x" },
      ],
    });
    expect(result).toEqual([]);
  });

  it("scores lower confidence for date 30-60 days vs ≤30 days", async () => {
    mockedInvoiceFindMany.mockResolvedValue([
      invoice({ issueDate: "2026-02-15" }), // ~70 days before; but inside our 60d range? actually outside
    ]);
    mockedBillFindMany.mockResolvedValue([]);

    // 70 days outside → excluded
    let result = await suggestMatchesForBankRows({
      organizationId: "org-1",
      rows: [{ date: "2026-04-25", credit: 50000, description: "x" }],
    });
    expect(result).toEqual([]);

    // 45 days → 80 confidence
    mockedInvoiceFindMany.mockResolvedValue([
      invoice({ issueDate: "2026-03-10" }),
    ]);
    result = await suggestMatchesForBankRows({
      organizationId: "org-1",
      rows: [{ date: "2026-04-25", credit: 50000, description: "x" }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe(80);
  });

  it("returns empty when no rows provided", async () => {
    const result = await suggestMatchesForBankRows({
      organizationId: "org-1",
      rows: [],
    });
    expect(result).toEqual([]);
  });

  it("ignores rows that are neither credit nor debit", async () => {
    mockedInvoiceFindMany.mockResolvedValue([invoice()]);
    mockedBillFindMany.mockResolvedValue([]);

    const result = await suggestMatchesForBankRows({
      organizationId: "org-1",
      rows: [
        { date: "2026-04-25", description: "balance brought forward" },
      ],
    });
    expect(result).toEqual([]);
  });

  it("picks the best-confidence match when multiple candidates fit", async () => {
    // Two invoices both exact-amount match, one with closer date.
    mockedInvoiceFindMany.mockResolvedValue([
      invoice({ id: "i1", number: "INV-001", issueDate: "2026-03-15" }), // 41 days
      invoice({ id: "i2", number: "INV-002", issueDate: "2026-04-10" }), // 15 days
    ]);
    mockedBillFindMany.mockResolvedValue([]);

    const result = await suggestMatchesForBankRows({
      organizationId: "org-1",
      rows: [{ date: "2026-04-25", credit: 50000, description: "x" }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].entity.number).toBe("INV-002"); // 15 days → 100 vs 41 days → 80
  });

  it("returns one match per row when multiple rows match", async () => {
    mockedInvoiceFindMany.mockResolvedValue([
      invoice({ id: "i1", number: "INV-001", total: 50000 }),
      invoice({ id: "i2", number: "INV-002", total: 25000 }),
    ]);
    mockedBillFindMany.mockResolvedValue([]);

    const result = await suggestMatchesForBankRows({
      organizationId: "org-1",
      rows: [
        { date: "2026-04-25", credit: 50000, description: "x" },
        { date: "2026-04-26", credit: 25000, description: "y" },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.entity.number).sort()).toEqual(["INV-001", "INV-002"]);
  });
});
