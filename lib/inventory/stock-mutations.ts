import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Stock-mutation helpers used by invoice CRUD actions.
 *
 * The codebase doesn't store a denormalized `Item.stock` column —
 * current stock is `openingStock + sum(InventoryAdjustment.quantity)`
 * for that item. So instead of UPDATE-ing a stock field, every
 * stock-affecting event creates one signed `InventoryAdjustment` row
 * per line.
 *
 * Reason string format: `Invoice <number>` — used by the reverse
 * helper to find the originals when an invoice is voided/deleted.
 *
 * Both helpers take a Prisma transaction client so they compose
 * inside existing `db.$transaction(async (tx) => ...)` blocks. Pass
 * `db` directly if you don't have a transaction.
 */

type TxClient = Prisma.TransactionClient | PrismaClient;

export type InvoiceStockLine = {
  itemId: string | null | undefined;
  quantity: Prisma.Decimal | string | number;
  description?: string | null;
};

export type InvoiceStockSummary = {
  number: string;
  date: Date;
};

const reasonFor = (invoiceNumber: string) => `Invoice ${invoiceNumber}`;

/**
 * Create negative `InventoryAdjustment` rows for every line whose
 * itemId points at an item with `trackInventory = true`. Skips lines
 * with no itemId or with items where tracking is off.
 *
 * Returns the IDs of the adjustment rows that were created (useful
 * for tests / audit).
 */
export async function applyInvoiceStockDecrement(
  tx: TxClient,
  organizationId: string,
  invoice: InvoiceStockSummary,
  lines: InvoiceStockLine[]
): Promise<string[]> {
  const trackedLines = await filterTrackedLines(tx, organizationId, lines);
  if (trackedLines.length === 0) return [];

  const reason = reasonFor(invoice.number);
  const ids: string[] = [];
  for (const line of trackedLines) {
    const adj = await tx.inventoryAdjustment.create({
      data: {
        organizationId,
        itemId: line.itemId!,
        date: invoice.date,
        quantity: negate(line.quantity),
        reason,
        notes: line.description ?? null,
      },
      select: { id: true },
    });
    ids.push(adj.id);
  }
  return ids;
}

/**
 * Mirror every `InventoryAdjustment` row tied to this invoice with a
 * positive-quantity counterpart, so net stock impact returns to zero.
 *
 * We don't delete the originals — the audit trail stays intact and
 * subsequent reversals (e.g. user un-voids and re-voids) all add up
 * correctly because we only mirror rows that haven't been mirrored.
 *
 * Reason on the new rows: `Reverse <invoice-reason>` so we can
 * detect already-mirrored decrements and skip them.
 */
export async function reverseInvoiceStockDecrement(
  tx: TxClient,
  organizationId: string,
  invoice: InvoiceStockSummary
): Promise<string[]> {
  const reason = reasonFor(invoice.number);
  const reverseReason = `Reverse ${reason}`;

  // Originals: negative-quantity rows tagged with the invoice reason.
  const originals = await tx.inventoryAdjustment.findMany({
    where: { organizationId, reason },
    select: { id: true, itemId: true, quantity: true, date: true, notes: true },
  });
  if (originals.length === 0) return [];

  // Already-applied reversals (so this is idempotent if called twice).
  const existingReversals = await tx.inventoryAdjustment.count({
    where: { organizationId, reason: reverseReason },
  });
  if (existingReversals >= originals.length) return [];

  const ids: string[] = [];
  for (const orig of originals) {
    const adj = await tx.inventoryAdjustment.create({
      data: {
        organizationId,
        itemId: orig.itemId,
        date: new Date(),
        quantity: negate(orig.quantity),
        reason: reverseReason,
        notes: orig.notes ?? null,
      },
      select: { id: true },
    });
    ids.push(adj.id);
  }
  return ids;
}

/* ------------------------------------------------------------------ */

async function filterTrackedLines(
  tx: TxClient,
  organizationId: string,
  lines: InvoiceStockLine[]
): Promise<InvoiceStockLine[]> {
  const itemIds = Array.from(
    new Set(lines.map((l) => l.itemId).filter((x): x is string => !!x))
  );
  if (itemIds.length === 0) return [];
  const tracked = await tx.item.findMany({
    where: {
      id: { in: itemIds },
      organizationId,
      trackInventory: true,
    },
    select: { id: true },
  });
  const trackedSet = new Set(tracked.map((t) => t.id));
  return lines.filter((l) => l.itemId && trackedSet.has(l.itemId));
}

function negate(q: Prisma.Decimal | string | number): Prisma.Decimal | string {
  // Prisma accepts Decimal | string for Decimal columns; we normalize
  // to string for portability.
  if (typeof q === "number") return (-q).toString();
  if (typeof q === "string") {
    if (q.startsWith("-")) return q.slice(1);
    return "-" + q;
  }
  // Decimal — call .neg()
  return q.neg();
}
