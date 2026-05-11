"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, ExternalLink, History } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getAdjustmentHistoryAction,
  type AdjustmentHistoryRow,
} from "./actions";

/**
 * Slide-out dialog showing the full InventoryAdjustment ledger for
 * one item. Clicking a row's "Source" link deep-links to the
 * invoice or credit note that triggered the adjustment.
 *
 * Controlled by the `itemId` prop on the parent — set to null to
 * close. The parent reflects this in the URL (`?item=<id>`) so the
 * dialog survives reloads.
 */
export function AdjustmentHistoryDialog({
  itemId,
  onClose,
}: {
  itemId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = React.useState<{
    item: string;
    rows: AdjustmentHistoryRow[];
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!itemId) {
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAdjustmentHistoryAction({ itemId })
      .then((r) => {
        if (cancelled) return;
        if (r.ok) {
          setData({ item: r.item, rows: r.rows });
        } else {
          setError(r.error);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [itemId]);

  return (
    <Dialog
      open={!!itemId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            Adjustment history{data ? <span> — {data.item}</span> : null}
          </DialogTitle>
          <DialogDescription>
            Every stock movement for this item in chronological order.
            Tap a source link to open the invoice or credit note that
            triggered it.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">
            <Loader2 className="h-5 w-5 mx-auto animate-spin" />
          </div>
        ) : error ? (
          <div className="py-6 text-sm text-destructive">{error}</div>
        ) : data && data.rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No adjustments yet. This item is at its opening stock level.
          </div>
        ) : data ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 px-3">Date</th>
                  <th className="py-2 px-3 text-right">Qty</th>
                  <th className="py-2 px-3">Reason</th>
                  <th className="py-2 px-3">Source</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b last:border-b-0 hover:bg-muted/40"
                  >
                    <td className="py-2 px-3 tabular-nums">{row.date}</td>
                    <td
                      className={
                        "py-2 px-3 text-right tabular-nums font-mono " +
                        (row.quantity < 0
                          ? "text-destructive"
                          : row.quantity > 0
                          ? "text-emerald-600"
                          : "text-muted-foreground")
                      }
                    >
                      {row.quantity >= 0 ? "+" : ""}
                      {row.quantity.toFixed(2)}
                    </td>
                    <td className="py-2 px-3">
                      <div>{row.reason}</div>
                      {row.notes ? (
                        <div className="text-xs text-muted-foreground">
                          {row.notes}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2 px-3">
                      {row.sourceLink ? (
                        <Link
                          href={
                            row.sourceLink.type === "invoice"
                              ? `/sales/invoices/${row.sourceLink.id}`
                              : `/sales/credit-notes/${row.sourceLink.id}`
                          }
                          className="text-primary hover:underline inline-flex items-center gap-1 text-xs"
                        >
                          {row.sourceLink.number}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          —
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-xs text-muted-foreground mt-3 px-3">
              {data.rows.length} adjustment{data.rows.length === 1 ? "" : "s"} total
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
