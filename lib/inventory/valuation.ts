import { db } from "@/lib/db";
import { computeStockLevels, type ItemStockRow } from "./stock-levels";

/**
 * Stock valuation report — values each tracked item's current on-hand
 * stock at its cost price, sums for a total inventory value.
 *
 * Valuation method: **standard cost** (Item.costPrice). FIFO / WAC are
 * more accurate but require a per-batch ledger we don't have yet.
 * Standard cost is the right v1 because:
 *   - matches what most small businesses want to see day-to-day
 *   - doesn't depend on the purchase history (which may be sparse)
 *   - matches how the existing Item form captures cost
 *
 * Items with no `costPrice` set are valued at 0 with a flag so the UI
 * can highlight them — they pull down the report's accuracy.
 */

export type StockValuationRow = ItemStockRow & {
  costPrice: number | null;
  value: number;
  /** True when costPrice is null/0 — caller should flag this in the UI. */
  missingCost: boolean;
};

export type StockValuationSummary = {
  rows: StockValuationRow[];
  totalValue: number;
  totalItems: number;
  totalUnits: number;
  itemsMissingCost: number;
  itemsBelowReorder: number;
  itemsOutOfStock: number;
};

/** Pure: turn stock-level rows + costs into a valuation summary. */
export function summarizeValuation(
  rows: Array<ItemStockRow & { costPrice: number | null }>
): StockValuationSummary {
  let totalValue = 0;
  let totalUnits = 0;
  let itemsMissingCost = 0;
  let itemsBelowReorder = 0;
  let itemsOutOfStock = 0;

  const valued: StockValuationRow[] = rows.map((r) => {
    const cost = r.costPrice ?? 0;
    const missingCost = !r.costPrice || r.costPrice === 0;
    const value = r.currentStock * cost;
    totalValue += value;
    if (r.currentStock > 0) totalUnits += r.currentStock;
    if (missingCost) itemsMissingCost += 1;
    if (r.status === "OUT") itemsOutOfStock += 1;
    else if (r.status === "LOW") itemsBelowReorder += 1;
    return { ...r, costPrice: r.costPrice ?? null, value, missingCost };
  });

  return {
    rows: valued,
    totalValue,
    totalItems: rows.length,
    totalUnits,
    itemsMissingCost,
    itemsBelowReorder,
    itemsOutOfStock,
  };
}

/** Production entry point — fetches stock levels + costs from Prisma. */
export async function computeStockValuation(
  organizationId: string
): Promise<StockValuationSummary> {
  const stockRows = await computeStockLevels(organizationId);
  if (stockRows.length === 0) {
    return summarizeValuation([]);
  }
  const items = await db.item.findMany({
    where: {
      organizationId,
      id: { in: stockRows.map((r) => r.id) },
    },
    select: { id: true, costPrice: true },
  });
  const costById = new Map(
    items.map((i) => [i.id, i.costPrice ? Number(i.costPrice) : null])
  );
  return summarizeValuation(
    stockRows.map((r) => ({ ...r, costPrice: costById.get(r.id) ?? null }))
  );
}
