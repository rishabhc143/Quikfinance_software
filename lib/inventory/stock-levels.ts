import { db } from "@/lib/db";
import { computeReservedByItem } from "./reservations";

/**
 * Compute current stock for every item with `trackInventory: true`
 * in an organization.
 *
 *   onHand    = openingStock + sum(InventoryAdjustment.quantity)
 *   reserved  = sum(InventoryReservation.quantity where active)
 *   available = onHand − reserved
 *
 * "Available" is what the merchant can promise to a new customer.
 * "On hand" is what's physically in the warehouse. They diverge
 * once Sales Orders start reserving stock (PR-E/F).
 *
 * InventoryAdjustment.quantity is signed — invoice decrements are
 * negative, credit-note returns are positive. The sum-with-the-
 * right-sign happens at the DB layer via groupBy + _sum.
 */

export type ItemStockRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  openingStock: number;
  totalAdjustment: number;
  /** Physical on-hand stock (openingStock + adjustments). */
  currentStock: number;
  /** Sum of active reservations against this item. */
  reserved: number;
  /** What can be sold to a new customer (currentStock − reserved). */
  available: number;
  reorderPoint: number | null;
  /** Status uses `available`, not `currentStock` — reserved units
   *  aren't really for sale. */
  status: "OUT" | "LOW" | "OK";
};

/**
 * Pure computation of an item's stock figures + status. Reorder
 * check uses `available` (not `currentStock`) so a heavily-reserved
 * item correctly flags LOW even when the warehouse is still full.
 */
export function computeItemStock(input: {
  openingStock: number;
  totalAdjustment: number;
  reserved?: number;
  reorderPoint: number | null;
}): {
  currentStock: number;
  reserved: number;
  available: number;
  status: "OUT" | "LOW" | "OK";
} {
  const current = input.openingStock + input.totalAdjustment;
  const reserved = input.reserved ?? 0;
  const available = current - reserved;
  let status: "OUT" | "LOW" | "OK";
  if (available <= 0) status = "OUT";
  else if (input.reorderPoint !== null && available <= input.reorderPoint)
    status = "LOW";
  else status = "OK";
  return { currentStock: current, reserved, available, status };
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

  const [adj, reservedByItem] = await Promise.all([
    db.inventoryAdjustment.groupBy({
      by: ["itemId"],
      where: {
        organizationId,
        itemId: { in: items.map((i) => i.id) },
      },
      _sum: { quantity: true },
    }),
    computeReservedByItem(db, organizationId),
  ]);
  const sumById = new Map(
    adj.map((a) => [a.itemId, Number(a._sum.quantity ?? 0)])
  );

  return items.map((it) => {
    const opening = it.openingStock ? Number(it.openingStock) : 0;
    const total = sumById.get(it.id) ?? 0;
    const reservedQty = reservedByItem.get(it.id) ?? 0;
    const rp = it.reorderPoint ? Number(it.reorderPoint) : null;
    const { currentStock, reserved, available, status } = computeItemStock({
      openingStock: opening,
      totalAdjustment: total,
      reserved: reservedQty,
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
      reserved,
      available,
      reorderPoint: rp,
      status,
    };
  });
}
