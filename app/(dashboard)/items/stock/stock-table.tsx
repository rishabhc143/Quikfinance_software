"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { AdjustmentHistoryDialog } from "./adjustment-history-dialog";

/**
 * Client-rendered stock table. Wraps the same data the server-rendered
 * version showed in PR #68, plus the per-item-history dialog. We made
 * it client so:
 *   - Clicking an item name opens the dialog instead of navigating
 *   - URL-state (?item=<id>) makes the dialog survive reloads
 *
 * The server page (page.tsx) computes rows + passes them in, so the
 * Prisma query still runs server-side.
 */

export type StockTableRow = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  openingStock: number;
  totalAdjustment: number;
  currentStock: number;
  reserved: number;
  available: number;
  reorderPoint: number | null;
  status: "OUT" | "LOW" | "OK";
};

export function StockTable({ rows }: { rows: StockTableRow[] }) {
  const router = useRouter();
  const search = useSearchParams();
  const openItemId = search.get("item");

  function openHistory(id: string) {
    const next = new URLSearchParams(search.toString());
    next.set("item", id);
    router.push(`?${next.toString()}`, { scroll: false });
  }

  function closeHistory() {
    const next = new URLSearchParams(search.toString());
    next.delete("item");
    const qs = next.toString();
    router.push(qs ? `?${qs}` : `?`, { scroll: false });
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="py-2 px-4">Item</th>
              <th className="py-2 px-4 text-right">Opening</th>
              <th className="py-2 px-4 text-right">Net adj</th>
              <th className="py-2 px-4 text-right">On hand</th>
              <th className="py-2 px-4 text-right">Reserved</th>
              <th className="py-2 px-4 text-right">Available</th>
              <th className="py-2 px-4 text-right">Reorder at</th>
              <th className="py-2 px-4">Status</th>
              <th className="py-2 px-4" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b last:border-b-0 hover:bg-muted/40"
              >
                <td className="py-2 px-4">
                  <Link
                    href={`/items/${row.id}`}
                    className="font-medium hover:underline"
                  >
                    {row.name}
                  </Link>
                  {row.sku ? (
                    <span className="ml-2 text-xs text-muted-foreground font-mono">
                      {row.sku}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 px-4 text-right tabular-nums">
                  {row.openingStock.toFixed(2)}
                  {row.unit ? (
                    <span className="ml-1 text-xs text-muted-foreground">
                      {row.unit}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 px-4 text-right tabular-nums">
                  <span
                    className={
                      row.totalAdjustment < 0
                        ? "text-destructive"
                        : row.totalAdjustment > 0
                        ? "text-emerald-600"
                        : "text-muted-foreground"
                    }
                  >
                    {row.totalAdjustment >= 0 ? "+" : ""}
                    {row.totalAdjustment.toFixed(2)}
                  </span>
                </td>
                <td className="py-2 px-4 text-right tabular-nums">
                  {row.currentStock.toFixed(2)}
                </td>
                <td className="py-2 px-4 text-right tabular-nums">
                  <span
                    className={
                      row.reserved > 0
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-muted-foreground"
                    }
                  >
                    {row.reserved.toFixed(2)}
                  </span>
                </td>
                <td
                  className={
                    "py-2 px-4 text-right tabular-nums font-semibold " +
                    (row.available <= 0
                      ? "text-destructive"
                      : row.reorderPoint !== null &&
                        row.available <= row.reorderPoint
                      ? "text-amber-700 dark:text-amber-400"
                      : "")
                  }
                >
                  {row.available.toFixed(2)}
                </td>
                <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                  {row.reorderPoint !== null
                    ? row.reorderPoint.toFixed(2)
                    : "—"}
                </td>
                <td className="py-2 px-4">
                  {row.status === "OUT" ? (
                    <Badge variant="destructive">Out of stock</Badge>
                  ) : row.status === "LOW" ? (
                    <Badge
                      variant="outline"
                      className="border-amber-400 text-amber-700 dark:text-amber-400"
                    >
                      Low
                    </Badge>
                  ) : (
                    <Badge variant="secondary">In stock</Badge>
                  )}
                </td>
                <td className="py-2 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => openHistory(row.id)}
                    className="text-xs text-primary hover:underline"
                  >
                    History
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AdjustmentHistoryDialog
        itemId={openItemId}
        onClose={closeHistory}
      />
    </>
  );
}
