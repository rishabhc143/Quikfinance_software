"use server";

import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { parseSourceFromReason } from "@/lib/inventory/parse-source";

/**
 * Server action for the adjustment-history dialog on /items/stock.
 *
 * Returns every InventoryAdjustment row for a single item in
 * chronological order (newest first), scoped to the caller's
 * organization.
 */

export type AdjustmentHistoryRow = {
  id: string;
  date: string; // ISO YYYY-MM-DD
  quantity: number; // signed
  reason: string;
  notes: string | null;
  /**
   * When `reason` matches a known source-doc pattern, sourceLink is
   * the entity ID for a client-side <Link>. Null otherwise.
   */
  sourceLink:
    | {
        type: "invoice" | "credit-note" | "delivery-challan";
        id: string;
        number: string;
      }
    | null;
};

export async function getAdjustmentHistoryAction(input: {
  itemId: string;
}): Promise<{ ok: true; item: string; rows: AdjustmentHistoryRow[] } | { ok: false; error: string }> {
  const { organization } = await requireOrganization();
  if (!input.itemId) return { ok: false, error: "Item id is required" };

  const item = await db.item.findFirst({
    where: {
      id: input.itemId,
      organizationId: organization.id,
      deletedAt: null,
    },
    select: { id: true, name: true },
  });
  if (!item) return { ok: false, error: "Item not found" };

  const rows = await db.inventoryAdjustment.findMany({
    where: { organizationId: organization.id, itemId: input.itemId },
    orderBy: { date: "desc" },
    select: {
      id: true,
      date: true,
      quantity: true,
      reason: true,
      notes: true,
    },
  });

  // For each row whose reason names a source doc, look up the doc's
  // id so the UI can deep-link. Doing the lookups in batch.
  const parsed = rows.map((r) => parseSourceFromReason(r.reason));
  const numbersFor = (
    type: "invoice" | "credit-note" | "delivery-challan"
  ): string[] =>
    Array.from(
      new Set(
        parsed
          .filter((p): p is NonNullable<typeof p> => p?.type === type)
          .map((p) => p.number)
      )
    );

  const invoiceNumbers = numbersFor("invoice");
  const creditNoteNumbers = numbersFor("credit-note");
  const dcNumbers = numbersFor("delivery-challan");

  const [invoiceMap, creditNoteMap, dcMap] = await Promise.all([
    invoiceNumbers.length
      ? db.invoice
          .findMany({
            where: {
              organizationId: organization.id,
              number: { in: invoiceNumbers },
            },
            select: { id: true, number: true },
          })
          .then((arr) => new Map(arr.map((i) => [i.number, i.id])))
      : Promise.resolve(new Map<string, string>()),
    creditNoteNumbers.length
      ? db.creditNote
          .findMany({
            where: {
              organizationId: organization.id,
              number: { in: creditNoteNumbers },
            },
            select: { id: true, number: true },
          })
          .then((arr) => new Map(arr.map((c) => [c.number, c.id])))
      : Promise.resolve(new Map<string, string>()),
    dcNumbers.length
      ? db.deliveryChallan
          .findMany({
            where: {
              organizationId: organization.id,
              number: { in: dcNumbers },
            },
            select: { id: true, number: true },
          })
          .then((arr) => new Map(arr.map((d) => [d.number, d.id])))
      : Promise.resolve(new Map<string, string>()),
  ]);

  return {
    ok: true,
    item: item.name,
    rows: rows.map((r) => {
      const p = parseSourceFromReason(r.reason);
      let sourceLink: AdjustmentHistoryRow["sourceLink"] = null;
      if (p?.type === "invoice") {
        const id = invoiceMap.get(p.number);
        if (id) sourceLink = { type: "invoice", id, number: p.number };
      } else if (p?.type === "credit-note") {
        const id = creditNoteMap.get(p.number);
        if (id) sourceLink = { type: "credit-note", id, number: p.number };
      } else if (p?.type === "delivery-challan") {
        const id = dcMap.get(p.number);
        if (id) sourceLink = { type: "delivery-challan", id, number: p.number };
      }
      return {
        id: r.id,
        date: r.date.toISOString().slice(0, 10),
        quantity: Number(r.quantity),
        reason: r.reason,
        notes: r.notes,
        sourceLink,
      };
    }),
  };
}

