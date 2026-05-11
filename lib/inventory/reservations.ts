import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Inventory reservation helpers.
 *
 * Flow (typical distribution scenario):
 *
 *   1. Sales Order CONFIRMED → reserveStock("SalesOrder", so, lines)
 *      → InventoryReservation rows with releasedAt=null, consumedAt=null
 *
 *   2a. Sales Order VOID / DELETE → releaseStock("SalesOrder", soId)
 *       → sets releasedAt on the rows; available stock returns
 *
 *   2b. Delivery Challan DELIVERED for that SO → consumeReservation(
 *         "SalesOrder", soId, dc, lines)
 *       → sets consumedAt on the SO's reservations AND creates
 *         negative InventoryAdjustment rows tied to the DC.
 *       → reserved drops, on-hand drops; both stay in sync.
 *
 * Three states for any reservation row:
 *   active    — releasedAt IS NULL AND consumedAt IS NULL
 *   released  — releasedAt IS NOT NULL (cancelled before ship)
 *   consumed  — consumedAt IS NOT NULL (shipped; counted in on-hand)
 */

type TxClient = Prisma.TransactionClient | PrismaClient;

export type ReservationSource = {
  type: "SalesOrder" | "DeliveryChallan";
  id: string;
  number: string;
};

export type ReservationLine = {
  itemId: string | null | undefined;
  quantity: Prisma.Decimal | string | number;
};

const asString = (v: Prisma.Decimal | string | number): string => {
  if (typeof v === "number") return Math.abs(v).toString();
  if (typeof v === "string") return v.startsWith("-") ? v.slice(1) : v;
  return v.abs().toString();
};

/**
 * Create reservation rows for every line whose item has
 * `trackInventory=true`. Returns the IDs that were created.
 *
 * Idempotent against duplicate calls for the same (sourceType,
 * sourceId): if any non-released, non-consumed reservation already
 * exists for this source, the function no-ops. This means calling
 * `reserveStock` twice for the same Sales Order is safe.
 */
export async function reserveStock(
  tx: TxClient,
  organizationId: string,
  source: ReservationSource,
  lines: ReservationLine[]
): Promise<string[]> {
  // Idempotency check
  const existing = await tx.inventoryReservation.count({
    where: {
      organizationId,
      sourceType: source.type,
      sourceId: source.id,
      releasedAt: null,
      consumedAt: null,
    },
  });
  if (existing > 0) return [];

  // Only reserve for items with trackInventory=true
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

  const trackedLines = lines.filter(
    (l) => l.itemId && trackedSet.has(l.itemId)
  );
  if (trackedLines.length === 0) return [];

  const ids: string[] = [];
  for (const line of trackedLines) {
    const r = await tx.inventoryReservation.create({
      data: {
        organizationId,
        itemId: line.itemId!,
        quantity: asString(line.quantity),
        sourceType: source.type,
        sourceId: source.id,
        sourceNumber: source.number,
      },
      select: { id: true },
    });
    ids.push(r.id);
  }
  return ids;
}

/**
 * Mark every active reservation for this source as released.
 * Idempotent: rows that are already released or consumed stay
 * untouched.
 */
export async function releaseStock(
  tx: TxClient,
  organizationId: string,
  sourceType: ReservationSource["type"],
  sourceId: string
): Promise<number> {
  const result = await tx.inventoryReservation.updateMany({
    where: {
      organizationId,
      sourceType,
      sourceId,
      releasedAt: null,
      consumedAt: null,
    },
    data: { releasedAt: new Date() },
  });
  return result.count;
}

/**
 * Consume reservations tied to `sourceType:sourceId` (typically a
 * Sales Order). For each consumed reservation, also create a
 * matching negative InventoryAdjustment so on-hand drops by the
 * same quantity.
 *
 * The adjustment's reason is `<dcSource.type> <dcSource.number>` so
 * the existing reversal logic in stock-mutations.ts works if the
 * DC is later voided.
 *
 * Returns the number of reservations consumed.
 */
export async function consumeReservation(
  tx: TxClient,
  organizationId: string,
  reservationSource: { type: ReservationSource["type"]; id: string },
  dcSource: { type: "DeliveryChallan"; number: string },
  date: Date
): Promise<number> {
  const active = await tx.inventoryReservation.findMany({
    where: {
      organizationId,
      sourceType: reservationSource.type,
      sourceId: reservationSource.id,
      releasedAt: null,
      consumedAt: null,
    },
  });
  if (active.length === 0) return 0;

  const now = new Date();
  const dcReason = `${dcSource.type} ${dcSource.number}`;
  for (const r of active) {
    await tx.inventoryReservation.update({
      where: { id: r.id },
      data: { consumedAt: now },
    });
    // Negative on-hand adjustment for the same quantity. Reason
    // matches the format the existing reverse helper expects, so a
    // DC void/return can later mirror it back with a positive row.
    await tx.inventoryAdjustment.create({
      data: {
        organizationId,
        itemId: r.itemId,
        date,
        quantity: "-" + r.quantity.toString().replace(/^-/, ""),
        reason: dcReason,
        notes: `Consumed from ${reservationSource.type} ${r.sourceNumber} reservation`,
      },
    });
  }
  return active.length;
}

/**
 * Sum of active (non-released, non-consumed) reserved quantities,
 * per item. Used by the stock-levels page to compute "available"
 * separately from "on hand".
 *
 * Returns a Map<itemId, totalReservedQty>.
 */
export async function computeReservedByItem(
  tx: TxClient,
  organizationId: string
): Promise<Map<string, number>> {
  const rows = await tx.inventoryReservation.groupBy({
    by: ["itemId"],
    where: {
      organizationId,
      releasedAt: null,
      consumedAt: null,
    },
    _sum: { quantity: true },
  });
  return new Map(
    rows.map((r) => [r.itemId, Number(r._sum.quantity ?? 0)])
  );
}
