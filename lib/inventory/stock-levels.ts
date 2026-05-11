import { db } from "@/lib/db";

/**
 * Compute current stock for every item with `trackInventory: true`
 * in an organization.
 *
 * Stock = openingStock + sum(InventoryAdjustment.quantity).
 *
 * The InventoryAdjustment.quantity column is signed — invoice
 * decrements are negative, manual additions are positive. The
 * sum-with-the-right-sign happens at the DB layer via groupBy +
 * _sum so it scales to a real-world adjustment volume.
 */

export type ItemStockRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  openingStock: number;
  totalAdjustment: number;
  currentStock: number;
  reorderPoint: number | null;
  status: "OUT" | "LOW" | "OK";
};

/**
 * Pure computation of an item's current stock + status given its
 * opening stock, sum of adjustments, and reorder point. Extracted so
 * it can be unit-tested without touching Prisma.
 */
export function computeItemStock(input: {
  openingStock: number;
  totalAdjustment: number;
  reorderPoint: number | null;
}): { currentStock: number; status: "OUT" | "LOW" | "OK" } {
  const current = input.openingStock + input.totalAdjustment;
  let status: "OUT" | "LOW" | "OK";
  if (current <= 0) status = "OUT";
  else if (input.reorderPoint !== null && current <= input.reorderPoint)
    status = "LOW";
  else status = "OK";
  return { currentStock: current, status };
}

export async function computeStockLevels(
  organizationId: string
): Promise<ItemStockRow[]> {
  const items = await db.item.findMany({
    where: {
      organizationId,
      trackInventory: true,
      deletedAt: null,
    },
    select: {
      id: true,
      name: true,
      sku: true,
      unit: true,
      openingStock: true,
      reorderPoint: true,
    },
    orderBy: { name: "asc" },
  });

  if (items.length === 0) return [];

  const adj = await db.inventoryAdjustment.groupBy({
    by: ["itemId"],
    where: {
      organizationId,
      itemId: { in: items.map((i) => i.id) },
    },
    _sum: { quantity: true },
  });
  const sumById = new Map(
    adj.map((a) => [a.itemId, Number(a._sum.quantity ?? 0)])
  );

  return items.map((it) => {
    const opening = it.openingStock ? Number(it.openingStock) : 0;
    const total = sumById.get(it.id) ?? 0;
    const rp = it.reorderPoint ? Number(it.reorderPoint) : null;
    const { currentStock, status } = computeItemStock({
      openingStock: opening,
      totalAdjustment: total,
      reorderPoint: rp,
    });
    return {
      id: it.id,
      name: it.name,
      sku: it.sku,
      unit: it.unit,
      openingStock: opening,
      totalAdjustment: total,
      currentStock,
      reorderPoint: rp,
      status,
    };
  });
}
