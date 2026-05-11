"use client";

import * as React from "react";
import { format } from "date-fns";
import { Briefcase, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { formatMoney } from "@/lib/money";
import type { BillableSource } from "@/lib/sales/billable-expenses";

/**
 * BillableExpensesPanel — renders on the Invoice form below the
 * customer band. Watches the selected customer id; when it changes,
 * calls `loadAction({ customerId })` to fetch unbilled billable
 * items (Bill line items + Expense rows). Each item has a checkbox;
 * "Add N to invoice" calls `onAddLines` with the selected items
 * mapped to LineItem shape + their source identifiers so the parent
 * can later mark them used during invoice save.
 *
 * Empty / disabled / loading states are explicit so the panel never
 * surprises the user with a flicker — when there are zero items,
 * nothing renders.
 */

export type BillableExpenseAdd = {
  /** New LineItem to inject into the invoice's line table. */
  line: {
    name: string;
    description: string;
    quantity: string;
    rate: string;
    accountId: string | null;
  };
  /** Source identifier — `createInvoiceAction` reads this to mark
   *  the row used (BillLineItem.billableUsedAt or Expense.isBilled). */
  source: {
    type: "BILL_LINE_ITEM" | "EXPENSE";
    id: string;
    amount: number;
  };
};

type Props = {
  customerId: string | null;
  currency: string;
  loadAction: (input: { customerId: string }) => Promise<BillableSource[]>;
  onAddLines: (adds: BillableExpenseAdd[]) => void;
};

export function BillableExpensesPanel({
  customerId,
  currency,
  loadAction,
  onAddLines,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [items, setItems] = React.useState<BillableSource[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!customerId) {
      setItems([]);
      setSelected(new Set());
      return;
    }
    let cancelled = false;
    setLoading(true);
    loadAction({ customerId })
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        // Default-select everything so the common case (one-click
        // "Add all to invoice") is one click.
        setSelected(new Set(rows.map((r) => keyOf(r))));
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(
          err instanceof Error ? err.message : "Couldn't load billable items"
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, loadAction]);

  function keyOf(r: BillableSource): string {
    return `${r.type}:${r.id}`;
  }

  function toggleAll() {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((r) => keyOf(r))));
    }
  }

  function toggleOne(r: BillableSource) {
    const k = keyOf(r);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function add() {
    const picked = items.filter((r) => selected.has(keyOf(r)));
    if (picked.length === 0) {
      toast.error("Pick at least one billable item");
      return;
    }
    const adds: BillableExpenseAdd[] = picked.map((r) => ({
      line: {
        name: r.label,
        description: r.description || r.sourceLabel,
        quantity: "1",
        rate: String(r.amount),
        accountId: r.accountId,
      },
      source: {
        type: r.type,
        id: r.id,
        amount: r.amount,
      },
    }));
    onAddLines(adds);
    // Optimistically remove the added items from the local list so
    // the user can't double-add in the same session. They'll
    // re-disappear on the next page load because the save action
    // marks them used in the DB.
    const addedKeys = new Set(picked.map((r) => keyOf(r)));
    setItems((prev) => prev.filter((r) => !addedKeys.has(keyOf(r))));
    setSelected(new Set());
    toast.success(
      `Added ${picked.length} billable item${
        picked.length === 1 ? "" : "s"
      } to invoice`
    );
  }

  if (!customerId) return null;
  if (loading && items.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-xs text-muted-foreground">
        Checking for billable items…
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/30 dark:bg-amber-950/10">
      <CardContent className="pt-4 space-y-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-3 text-left"
        >
          <Briefcase
            className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0"
            aria-hidden
          />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">
              Billable Expenses Available ({items.length})
            </div>
            <div className="text-xs text-muted-foreground">
              {items.length} unbilled item
              {items.length === 1 ? "" : "s"} for this customer — pick which
              to add.
            </div>
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </button>

        {open ? (
          <div className="space-y-2 pt-2 border-t border-amber-200/50">
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={toggleAll}
                className="underline text-primary"
              >
                {selected.size === items.length
                  ? "Clear selection"
                  : "Select all"}
              </button>
              <span className="text-muted-foreground">
                {selected.size} of {items.length} selected
              </span>
            </div>

            <div className="rounded-md border bg-background divide-y max-h-72 overflow-y-auto">
              {items.map((r) => {
                const k = keyOf(r);
                return (
                  <label
                    key={k}
                    className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(k)}
                      onChange={() => toggleOne(r)}
                      className="h-4 w-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.label}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.sourceLabel} · {format(r.date, "dd MMM yyyy")}
                        {r.description ? ` · ${r.description}` : ""}
                      </div>
                    </div>
                    <div className="text-sm tabular-nums shrink-0">
                      {formatMoney(r.amount, currency)}
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                size="sm"
                onClick={add}
                disabled={selected.size === 0}
                className="gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                Add {selected.size > 0 ? selected.size : ""} to invoice
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
