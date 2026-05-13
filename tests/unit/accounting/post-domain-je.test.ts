import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  postInvoiceSentJe,
  postInvoicePaymentJe,
  postBillOpenJe,
  postBillPaymentJe,
  reverseInvoiceSentJe,
  reverseAllInvoiceJes,
  reverseBillOpenJe,
  reverseAllBillJes,
  reversePaymentReceivedJes,
  reversePaymentMadeJes,
  resolveBankCoaForPayment,
} from "@/lib/accounting/post-domain-je";

/**
 * Tests for RPT-B Phase 1 helpers.
 *
 * These tests use a hand-rolled mock TransactionClient — no real DB
 * is touched. The goal is to verify:
 *   - idempotency (don't double-post when called twice)
 *   - reference convention (right keys for find / delete)
 *   - DR/CR direction is the right way around
 *   - zero / negative inputs are no-ops, not errors
 *   - resolveBankCoaForPayment walks the resolution order
 *
 * The post / reverse helpers depend on `getOrCreateSystemAccount`,
 * which we mock at the module boundary.
 */

// Hoisted mocks for the system-accounts module so the helpers can
// look up AR / AP / REV / EXP without hitting the DB.
vi.mock("@/lib/accounting/system-accounts", () => ({
  getOrCreateSystemAccount: vi.fn((_orgId: string, kind: string) =>
    Promise.resolve({
      id: `sys-${kind.toLowerCase()}`,
      name: kind,
      code: `SYS-${kind}`,
      type: kind,
    })
  ),
}));

type MockTx = {
  journalEntry: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  chartOfAccount: {
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  bankAccount: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

function mockTx(): MockTx {
  return {
    journalEntry: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "je-new" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    chartOfAccount: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "coa-new" }),
    },
    bankAccount: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({ id: "bank" }),
    },
  };
}

const ORG = "org-1";
const INV = { id: "inv-1", number: "INV-001", issueDate: new Date("2026-04-15"), total: 1000 };
const BILL = { id: "bill-1", number: "BILL-001", issueDate: new Date("2026-04-20"), total: 500 };

describe("postInvoiceSentJe", () => {
  it("creates a balanced DR-AR / CR-Revenue JE the first time", async () => {
    const tx = mockTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await postInvoiceSentJe(tx as any, ORG, INV);
    expect(tx.journalEntry.findFirst).toHaveBeenCalledWith({
      where: { organizationId: ORG, reference: "INV-SENT:inv-1" },
      select: { id: true },
    });
    expect(tx.journalEntry.create).toHaveBeenCalledTimes(1);
    const arg = tx.journalEntry.create.mock.calls[0][0].data;
    expect(arg.reference).toBe("INV-SENT:inv-1");
    expect(arg.lines.create).toEqual([
      expect.objectContaining({ accountId: "sys-ar", debit: 1000, credit: 0 }),
      expect.objectContaining({ accountId: "sys-sales_revenue", debit: 0, credit: 1000 }),
    ]);
  });

  it("is idempotent — second call with same invoice id finds existing + does not re-create", async () => {
    const tx = mockTx();
    tx.journalEntry.findFirst.mockResolvedValue({ id: "je-existing" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await postInvoiceSentJe(tx as any, ORG, INV);
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });

  it("no-op for a zero-total invoice", async () => {
    const tx = mockTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await postInvoiceSentJe(tx as any, ORG, { ...INV, total: 0 });
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe("postInvoicePaymentJe", () => {
  it("creates a DR-Bank / CR-AR JE keyed by paymentId:invoiceId", async () => {
    const tx = mockTx();
    await postInvoicePaymentJe(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      ORG,
      "pmt-1",
      "inv-1",
      "INV-001",
      750,
      new Date("2026-04-20"),
      "coa-bank"
    );
    expect(tx.journalEntry.findFirst).toHaveBeenCalledWith({
      where: { organizationId: ORG, reference: "INV-PMT:pmt-1:inv-1" },
      select: { id: true },
    });
    const arg = tx.journalEntry.create.mock.calls[0][0].data;
    expect(arg.lines.create).toEqual([
      expect.objectContaining({ accountId: "coa-bank", debit: 750, credit: 0 }),
      expect.objectContaining({ accountId: "sys-ar", debit: 0, credit: 750 }),
    ]);
  });

  it("no-ops on zero or negative amount", async () => {
    const tx = mockTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await postInvoicePaymentJe(tx as any, ORG, "pmt-1", "inv-1", "n", 0, new Date(), "coa");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await postInvoicePaymentJe(tx as any, ORG, "pmt-1", "inv-1", "n", -5, new Date(), "coa");
    expect(tx.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe("postBillOpenJe / postBillPaymentJe", () => {
  it("posts DR-Expense / CR-AP on bill open", async () => {
    const tx = mockTx();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await postBillOpenJe(tx as any, ORG, BILL);
    const arg = tx.journalEntry.create.mock.calls[0][0].data;
    expect(arg.reference).toBe("BILL-OPEN:bill-1");
    expect(arg.lines.create).toEqual([
      expect.objectContaining({ accountId: "sys-bill_expense", debit: 500, credit: 0 }),
      expect.objectContaining({ accountId: "sys-ap", debit: 0, credit: 500 }),
    ]);
  });

  it("posts DR-AP / CR-Bank on bill payment, keyed by paymentMadeId:billId", async () => {
    const tx = mockTx();
    await postBillPaymentJe(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      ORG,
      "pmade-1",
      "bill-1",
      "BILL-001",
      500,
      new Date("2026-04-25"),
      "coa-bank"
    );
    const arg = tx.journalEntry.create.mock.calls[0][0].data;
    expect(arg.reference).toBe("BILL-PMT:pmade-1:bill-1");
    expect(arg.lines.create).toEqual([
      expect.objectContaining({ accountId: "sys-ap", debit: 500, credit: 0 }),
      expect.objectContaining({ accountId: "coa-bank", debit: 0, credit: 500 }),
    ]);
  });
});

describe("reverse helpers", () => {
  let tx: MockTx;
  beforeEach(() => {
    tx = mockTx();
  });

  it("reverseInvoiceSentJe deletes only the INV-SENT key", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reverseInvoiceSentJe(tx as any, ORG, "inv-1");
    expect(tx.journalEntry.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, reference: "INV-SENT:inv-1" },
    });
  });

  it("reverseAllInvoiceJes deletes SENT + every payment leg for the invoice", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reverseAllInvoiceJes(tx as any, ORG, "inv-1");
    const where = tx.journalEntry.deleteMany.mock.calls[0][0].where;
    expect(where.OR).toEqual([
      { reference: "INV-SENT:inv-1" },
      { reference: { endsWith: ":inv-1" } },
    ]);
  });

  it("reverseBillOpenJe + reverseAllBillJes mirror the invoice helpers", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reverseBillOpenJe(tx as any, ORG, "bill-1");
    expect(tx.journalEntry.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, reference: "BILL-OPEN:bill-1" },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reverseAllBillJes(tx as any, ORG, "bill-1");
    expect(tx.journalEntry.deleteMany).toHaveBeenLastCalledWith({
      where: {
        organizationId: ORG,
        OR: [
          { reference: "BILL-OPEN:bill-1" },
          { reference: { endsWith: ":bill-1" } },
        ],
      },
    });
  });

  it("reversePaymentReceivedJes / reversePaymentMadeJes use startsWith keys", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reversePaymentReceivedJes(tx as any, ORG, "pmt-1");
    expect(tx.journalEntry.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: ORG, reference: { startsWith: "INV-PMT:pmt-1:" } },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await reversePaymentMadeJes(tx as any, ORG, "pmade-1");
    expect(tx.journalEntry.deleteMany).toHaveBeenLastCalledWith({
      where: { organizationId: ORG, reference: { startsWith: "BILL-PMT:pmade-1:" } },
    });
  });
});

describe("resolveBankCoaForPayment", () => {
  it("returns depositToAccountId directly when set + valid", async () => {
    const tx = mockTx();
    tx.chartOfAccount.findFirst.mockResolvedValue({ id: "coa-deposit" });
    const id = await resolveBankCoaForPayment(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      ORG,
      { depositToAccountId: "coa-deposit", bankAccountId: null }
    );
    expect(id).toBe("coa-deposit");
  });

  it("falls back to BankAccount.glAccountId when direct id absent", async () => {
    const tx = mockTx();
    tx.bankAccount.findFirst.mockResolvedValue({
      id: "bank-1",
      name: "HDFC",
      type: "BANK",
      glAccountId: "coa-bank-bridge",
    });
    const id = await resolveBankCoaForPayment(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      ORG,
      { depositToAccountId: null, bankAccountId: "bank-1" }
    );
    expect(id).toBe("coa-bank-bridge");
  });

  it("lazy-creates the bridge when bank has no glAccountId yet", async () => {
    const tx = mockTx();
    tx.bankAccount.findFirst.mockResolvedValue({
      id: "bank-1",
      name: "HDFC",
      type: "BANK",
      glAccountId: null,
    });
    tx.chartOfAccount.create.mockResolvedValue({ id: "coa-new-bridge" });
    const id = await resolveBankCoaForPayment(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      ORG,
      { depositToAccountId: null, bankAccountId: "bank-1" }
    );
    expect(id).toBe("coa-new-bridge");
    expect(tx.bankAccount.update).toHaveBeenCalledWith({
      where: { id: "bank-1" },
      data: { glAccountId: "coa-new-bridge" },
    });
  });

  it("falls back to SYS-CASH when no bank / deposit account is configured", async () => {
    const tx = mockTx();
    // No depositToAccountId, no bankAccountId — the helper should
    // dynamic-import system-accounts and return its CASH_ON_HAND id.
    const id = await resolveBankCoaForPayment(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tx as any,
      ORG,
      { depositToAccountId: null, bankAccountId: null }
    );
    // The mocked getOrCreateSystemAccount returns id `sys-cash_on_hand`.
    expect(id).toBe("sys-cash_on_hand");
  });
});
