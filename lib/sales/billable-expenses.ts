/**
 * Billable Expenses — server-side query helpers.
 *
 * The Billable Expenses panel on the Invoice form lists every
 * unbilled item the selected customer owes back:
 *
 *   - BillLineItem rows where `billableToCustomerId = customerId`
 *     and `billableUsedAt IS NULL` (set on a Bill the org received
 *     that should pass through to this customer).
 *   - Expense rows where `customerId = customerId`, `isBillable = true`,
 *     `isBilled = false`.
 *
 * Two query shapes, one return type. The Invoice save action consumes
 * `BillableSource` to mark each row used in a single transaction.
 */

import { db } from "@/lib/db";

export type BillableSource = {
  type: "BILL_LINE_ITEM" | "EXPENSE";
  id: string;
  /** Display label for the panel — e.g. "Bill INV-2024 line 2". */
  label: string;
  /** Free-form description from the source row. */
  description: string;
  /** Amount we'd pull onto the invoice (line.amount or expense.amount). */
  amount: number;
  /** Source-date for sorting + display. */
  date: Date;
  /** Source identifier for the user — e.g. parent Bill number or expense ref. */
  sourceLabel: string;
  /** Optional account id to seed on the new invoice line. */
  accountId: string | null;
};

/**
 * Load all unbilled billable items for a customer in one shot. Returns
 * BillLineItem rows + Expense rows merged + sorted by date desc.
 */
export async function loadBillableSourcesForCustomer(
  organizationId: string,
  customerId: string
): Promise<BillableSource[]> {
  const [billLines, expenses] = await Promise.all([
    db.billLineItem.findMany({
      where: {
        billableToCustomerId: customerId,
        billableUsedAt: null,
        bill: {
          organizationId,
          deletedAt: null,
          // Only consider Open / Paid / Partially Paid bills —
          // unbilled lines on Void/Draft bills aren't real costs yet.
          status: { in: ["OPEN", "PARTIALLY_PAID", "PAID", "OVERDUE"] },
        },
      },
      include: {
        bill: {
          select: { number: true, issueDate: true },
        },
      },
      orderBy: { id: "desc" },
      take: 100,
    }),
    db.expense.findMany({
      where: {
        organizationId,
        customerId,
        isBillable: true,
        isBilled: false,
        deletedAt: null,
      },
      take: 100,
      orderBy: { date: "desc" },
    }),
  ]);

  const fromBills: BillableSource[] = billLines.map((l) => ({
    type: "BILL_LINE_ITEM" as const,
    id: l.id,
    label: l.name || l.description || "Bill line item",
    description: l.description ?? "",
    amount: Number(l.amount),
    date: l.bill.issueDate,
    sourceLabel: `Bill ${l.bill.number}`,
    accountId: l.accountId,
  }));

  const fromExpenses: BillableSource[] = expenses.map((e) => ({
    type: "EXPENSE" as const,
    id: e.id,
    label: e.category,
    description: e.reference ?? "",
    amount: Number(e.amount),
    date: e.date,
    sourceLabel: e.number ? `Expense ${e.number}` : "Expense",
    accountId: e.expenseAccountId,
  }));

  return [...fromBills, ...fromExpenses].sort(
    (a, b) => b.date.getTime() - a.date.getTime()
  );
}

/**
 * After an Invoice is created/updated, mark each consumed
 * BillableSource as used:
 *   - BillLineItem.billableUsedAt = now()
 *   - Expense.isBilled = true + invoiceId = <id>
 *   - Create a BillableExpenseUsage audit row per source for the
 *     billable-tracking ledger.
 *
 * Idempotent — already-marked rows are skipped silently. Called
 * inside the invoice save transaction so a rollback unwinds the
 * marks too.
 */
// Loose tx type — the function only touches three models. Use any
// here because Prisma's TransactionClient type is verbose and not
// exported in a way that's stable across versions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseTx = any;

export async function markBillableSourcesUsed(
  tx: LooseTx,
  args: {
    organizationId: string;
    customerId: string;
    invoiceId: string;
    invoiceLineItemIds: string[];
    sources: Array<{
      type: "BILL_LINE_ITEM" | "EXPENSE";
      id: string;
      amount: number;
      invoiceLineIndex: number;
    }>;
  }
): Promise<void> {
  if (args.sources.length === 0) return;
  for (const s of args.sources) {
    const invoiceLineItemId =
      args.invoiceLineItemIds[s.invoiceLineIndex] ?? null;
    if (s.type === "BILL_LINE_ITEM") {
      await tx.billLineItem.updateMany({
        where: { id: s.id, billableUsedAt: null },
        data: { billableUsedAt: new Date() },
      });
    } else {
      await tx.expense.updateMany({
        where: {
          id: s.id,
          organizationId: args.organizationId,
          isBilled: false,
        },
        data: { isBilled: true, invoiceId: args.invoiceId },
      });
    }
    // Audit row — one per consumed source. Unique index on
    // (sourceType, sourceId) in BillableExpenseUsage prevents
    // double-billing the same source.
    if (invoiceLineItemId) {
      try {
        await tx.billableExpenseUsage.create({
          data: {
            organizationId: args.organizationId,
            sourceType: s.type,
            sourceId: s.id,
            customerId: args.customerId,
            invoiceLineItemId,
            amount: s.amount,
          },
        });
      } catch {
        // Unique constraint hit — already billed. Skip silently;
        // the row above already marked the source used.
      }
    }
  }
}
