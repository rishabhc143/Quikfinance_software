"use client";

import * as React from "react";
import { Briefcase, ChevronRight } from "lucide-react";

/**
 * Server pages query unbilled billable expenses for the selected
 * customer (from Bill line items and Expense rows) and render this
 * banner on top of the New Invoice form when any exist.
 *
 * Implementation note: the click-through panel that lists & adds
 * each item to the invoice is shipped as part of P9 (billable-
 * expenses integration). This v1 stub renders the banner so the
 * primitive is available; the wiring on the Invoice form is a
 * future PR.
 */
export function BillableExpensesBanner({
  count,
  onOpen,
}: {
  count: number;
  onOpen?: () => void;
}) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-left hover:bg-amber-100 dark:hover:bg-amber-950/30 transition-colors"
    >
      <Briefcase
        className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0"
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">
          Billable Expenses Available ({count})
        </div>
        <div className="text-xs text-muted-foreground">
          You have {count} unbilled expense{count === 1 ? "" : "s"} for this
          customer.
        </div>
      </div>
      <span className="inline-flex items-center text-sm text-primary">
        View &amp; Add <ChevronRight className="h-4 w-4 ml-0.5" />
      </span>
    </button>
  );
}
