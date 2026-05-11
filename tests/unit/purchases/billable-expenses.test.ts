import { describe, it, expect, vi } from "vitest";
import { markBillableSourcesUsed } from "@/lib/sales/billable-expenses";

/**
 * Tests for the BillableExpenses marking helper.
 *
 * These don't hit a real Prisma client — they pass in a minimal
 * mock that records the calls. Coverage:
 *  - No-op when sources array is empty
 *  - Bill line items marked via billLineItem.updateMany
 *  - Expense rows marked via expense.updateMany
 *  - BillableExpenseUsage audit row created when invoiceLineItemId
 *    can be resolved
 *  - Missing invoiceLineItemId (out-of-bounds invoiceLineIndex)
 *    skips the audit row but still marks the source used
 *  - Audit row creation failures (unique constraint) swallowed
 *    silently so retries are safe
 */

type Call = { table: string; method: string; args: unknown };

function mkTx() {
  const calls: Call[] = [];
  const failCreate = { value: false };
  const tx = {
    billLineItem: {
      updateMany: vi.fn(async (args: unknown) => {
        calls.push({ table: "billLineItem", method: "updateMany", args });
        return { count: 1 };
      }),
    },
    expense: {
      updateMany: vi.fn(async (args: unknown) => {
        calls.push({ table: "expense", method: "updateMany", args });
        return { count: 1 };
      }),
    },
    billableExpenseUsage: {
      create: vi.fn(async (args: unknown) => {
        calls.push({
          table: "billableExpenseUsage",
          method: "create",
          args,
        });
        if (failCreate.value) {
          throw new Error("Unique constraint failed");
        }
        return { id: "u1" };
      }),
    },
  };
  return { tx, calls, failCreate };
}

describe("markBillableSourcesUsed — no-ops", () => {
  it("returns immediately when sources array is empty", async () => {
    const { tx, calls } = mkTx();
    await markBillableSourcesUsed(tx, {
      organizationId: "org1",
      customerId: "cust1",
      invoiceId: "inv1",
      invoiceLineItemIds: [],
      sources: [],
    });
    expect(calls).toHaveLength(0);
  });
});

describe("markBillableSourcesUsed — BILL_LINE_ITEM marking", () => {
  it("calls billLineItem.updateMany with the right ID + null guard", async () => {
    const { tx, calls } = mkTx();
    await markBillableSourcesUsed(tx, {
      organizationId: "org1",
      customerId: "cust1",
      invoiceId: "inv1",
      invoiceLineItemIds: ["li1"],
      sources: [
        { type: "BILL_LINE_ITEM", id: "bl1", amount: 100, invoiceLineIndex: 0 },
      ],
    });
    const markCall = calls.find((c) => c.table === "billLineItem");
    expect(markCall).toBeTruthy();
    expect(markCall!.method).toBe("updateMany");
    // Update should target {id: 'bl1', billableUsedAt: null}.
    const args = markCall!.args as {
      where: { id: string; billableUsedAt: null };
      data: { billableUsedAt: Date };
    };
    expect(args.where.id).toBe("bl1");
    expect(args.where.billableUsedAt).toBeNull();
    expect(args.data.billableUsedAt).toBeInstanceOf(Date);
  });

  it("creates a BillableExpenseUsage audit row with the invoice line id", async () => {
    const { tx, calls } = mkTx();
    await markBillableSourcesUsed(tx, {
      organizationId: "org1",
      customerId: "cust1",
      invoiceId: "inv1",
      invoiceLineItemIds: ["li1", "li2"],
      sources: [
        {
          type: "BILL_LINE_ITEM",
          id: "bl1",
          amount: 100,
          invoiceLineIndex: 1,
        },
      ],
    });
    const usage = calls.find((c) => c.table === "billableExpenseUsage");
    expect(usage).toBeTruthy();
    const args = usage!.args as {
      data: {
        organizationId: string;
        sourceType: string;
        sourceId: string;
        customerId: string;
        invoiceLineItemId: string;
        amount: number;
      };
    };
    expect(args.data.organizationId).toBe("org1");
    expect(args.data.sourceType).toBe("BILL_LINE_ITEM");
    expect(args.data.sourceId).toBe("bl1");
    expect(args.data.customerId).toBe("cust1");
    expect(args.data.invoiceLineItemId).toBe("li2");
    expect(args.data.amount).toBe(100);
  });
});

describe("markBillableSourcesUsed — EXPENSE marking", () => {
  it("uses expense.updateMany with invoiceId and isBilled=true", async () => {
    const { tx, calls } = mkTx();
    await markBillableSourcesUsed(tx, {
      organizationId: "org1",
      customerId: "cust1",
      invoiceId: "inv99",
      invoiceLineItemIds: ["li1"],
      sources: [
        { type: "EXPENSE", id: "e1", amount: 75, invoiceLineIndex: 0 },
      ],
    });
    const markCall = calls.find((c) => c.table === "expense");
    expect(markCall).toBeTruthy();
    const args = markCall!.args as {
      where: {
        id: string;
        organizationId: string;
        isBilled: boolean;
      };
      data: { isBilled: boolean; invoiceId: string };
    };
    expect(args.where.id).toBe("e1");
    expect(args.where.organizationId).toBe("org1");
    expect(args.where.isBilled).toBe(false);
    expect(args.data.isBilled).toBe(true);
    expect(args.data.invoiceId).toBe("inv99");
  });
});

describe("markBillableSourcesUsed — robustness", () => {
  it("skips audit row when invoiceLineItemIds is out-of-bounds", async () => {
    const { tx, calls } = mkTx();
    await markBillableSourcesUsed(tx, {
      organizationId: "org1",
      customerId: "cust1",
      invoiceId: "inv1",
      invoiceLineItemIds: ["li1"],
      sources: [
        {
          type: "BILL_LINE_ITEM",
          id: "bl1",
          amount: 100,
          // Index out of range — the line was removed by the user
          // before save. We still mark the source used (matches the
          // documented v1 limitation in the invoice form comments).
          invoiceLineIndex: 5,
        },
      ],
    });
    // Source still marked used:
    expect(
      calls.some((c) => c.table === "billLineItem")
    ).toBe(true);
    // But no audit row:
    expect(
      calls.some((c) => c.table === "billableExpenseUsage")
    ).toBe(false);
  });

  it("swallows audit-row unique-constraint errors silently", async () => {
    const { tx, failCreate } = mkTx();
    failCreate.value = true;
    // Should NOT throw — the catch swallows the duplicate-billing
    // error so retries are idempotent.
    await expect(
      markBillableSourcesUsed(tx, {
        organizationId: "org1",
        customerId: "cust1",
        invoiceId: "inv1",
        invoiceLineItemIds: ["li1"],
        sources: [
          {
            type: "BILL_LINE_ITEM",
            id: "bl1",
            amount: 100,
            invoiceLineIndex: 0,
          },
        ],
      })
    ).resolves.toBeUndefined();
  });

  it("handles a mixed batch of BILL_LINE_ITEM + EXPENSE", async () => {
    const { tx, calls } = mkTx();
    await markBillableSourcesUsed(tx, {
      organizationId: "org1",
      customerId: "cust1",
      invoiceId: "inv1",
      invoiceLineItemIds: ["li1", "li2", "li3"],
      sources: [
        { type: "BILL_LINE_ITEM", id: "bl1", amount: 50, invoiceLineIndex: 0 },
        { type: "EXPENSE", id: "e1", amount: 25, invoiceLineIndex: 1 },
        { type: "BILL_LINE_ITEM", id: "bl2", amount: 75, invoiceLineIndex: 2 },
      ],
    });
    const billCalls = calls.filter((c) => c.table === "billLineItem");
    const expenseCalls = calls.filter((c) => c.table === "expense");
    const usageCalls = calls.filter(
      (c) => c.table === "billableExpenseUsage"
    );
    expect(billCalls).toHaveLength(2);
    expect(expenseCalls).toHaveLength(1);
    expect(usageCalls).toHaveLength(3);
  });
});
