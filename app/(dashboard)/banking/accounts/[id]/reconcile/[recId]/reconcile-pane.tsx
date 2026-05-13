"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2, CheckCircle2, AlertCircle, Filter } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { toast } from "sonner";
import {
  computeSummary,
  type ReconciliationLine,
} from "@/lib/banking/reconciliation-summary";
import {
  toggleClearedAction,
  bulkSetClearedAction,
  finaliseByIdAction,
} from "../actions";

export type ReconcileTxn = {
  id: string;
  /** ISO string — Server Component serialization friendly. */
  date: string;
  description: string | null;
  reference: string | null;
  amount: number;
  type: "CREDIT" | "DEBIT";
  isMatched: boolean;
  /** True when this row is cleared in THIS reconciliation. */
  cleared: boolean;
};

export function ReconcilePane({
  reconciliationId,
  bankAccountId,
  currency,
  openingBalance,
  closingBalance,
  startDate,
  endDate,
  txns,
  readOnly,
}: {
  reconciliationId: string;
  bankAccountId: string;
  currency: string;
  openingBalance: number;
  closingBalance: number;
  startDate: string;
  endDate: string;
  txns: ReconcileTxn[];
  /** True when the reconciliation is FINALISED/UNDONE — checkboxes disabled. */
  readOnly: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ReconcileTxn[]>(txns);
  const [pending, startTransition] = useTransition();
  const [hideUnmatched, setHideUnmatched] = useState(true);
  const [finalisingError, setFinalisingError] = useState<string | null>(null);

  const visibleRows = useMemo(
    () => (hideUnmatched ? rows.filter((r) => r.isMatched) : rows),
    [rows, hideUnmatched]
  );

  // The summary is computed against ALL eligible rows (visible or not).
  // Hiding unmatched is only a visual filter — their cleared state still
  // counts in the math.
  const summary = useMemo(() => {
    const lines: ReconciliationLine[] = rows.map((r) => ({
      id: r.id,
      amount: r.amount,
      type: r.type,
      cleared: r.cleared,
    }));
    return computeSummary({ openingBalance, closingBalance, lines });
  }, [rows, openingBalance, closingBalance]);

  function setRowCleared(id: string, next: boolean) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, cleared: next } : r)));
  }

  function handleToggle(row: ReconcileTxn) {
    if (readOnly) return;
    const next = !row.cleared;
    // Optimistic update.
    setRowCleared(row.id, next);
    startTransition(async () => {
      const res = await toggleClearedAction({
        reconciliationId,
        bankTransactionId: row.id,
        cleared: next,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Failed to update");
        setRowCleared(row.id, !next); // rollback
      }
    });
  }

  function handleClearAll(value: boolean) {
    if (readOnly) return;
    const targetIds = rows.filter((r) => r.cleared !== value).map((r) => r.id);
    if (targetIds.length === 0) return;
    // Optimistic.
    setRows((prev) => prev.map((r) => ({ ...r, cleared: value })));
    startTransition(async () => {
      const res = await bulkSetClearedAction({
        reconciliationId,
        bankTransactionIds: targetIds,
        cleared: value,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Bulk update failed");
        router.refresh();
      }
    });
  }

  function handleFinalise() {
    if (readOnly) return;
    if (!summary.balanced) {
      setFinalisingError(
        `Difference is ${formatMoney(summary.difference, currency)} — must be 0 to finalise.`
      );
      return;
    }
    setFinalisingError(null);
    startTransition(async () => {
      try {
        await finaliseByIdAction(reconciliationId);
        toast.success("Reconciliation finalised");
        router.push(`/banking/accounts/${bankAccountId}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Finalise failed";
        setFinalisingError(msg);
      }
    });
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      {/* ─────────── Left pane: transactions ─────────── */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b flex items-center justify-between gap-2">
            <div className="text-sm font-medium">
              Transactions ({visibleRows.length})
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setHideUnmatched((v) => !v)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                title="Toggle visibility of unmatched rows. Their cleared state still counts in the math."
              >
                <Filter className="h-3.5 w-3.5" />
                {hideUnmatched ? "Show unmatched too" : "Hide unmatched"}
              </button>
              {!readOnly ? (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleClearAll(true)}
                    disabled={pending}
                  >
                    Tick all
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleClearAll(false)}
                    disabled={pending}
                  >
                    Untick all
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          {visibleRows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? "No transactions in this period. Import a statement or add manual entries first."
                : "All transactions in this period are unmatched. Toggle 'Show unmatched too' to see them, or match/categorise them first."}
            </div>
          ) : (
            <ul className="divide-y max-h-[70vh] overflow-y-auto">
              {visibleRows.map((r) => (
                <li key={r.id}>
                  <label className="flex items-start gap-3 px-4 py-3 hover:bg-muted/60 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 cursor-pointer"
                      checked={r.cleared}
                      onChange={() => handleToggle(r)}
                      disabled={readOnly}
                      aria-label={`Clear ${r.description ?? r.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(r.date), "dd MMM yyyy")}
                        </span>
                        <span className="tabular-nums text-sm font-medium">
                          {formatMoney(r.amount, currency)}
                        </span>
                      </div>
                      <div className="text-sm mt-1 line-clamp-1">
                        {r.description ?? "—"}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant={r.type === "CREDIT" ? "secondary" : "outline"}
                          className="text-[10px]"
                        >
                          {r.type === "CREDIT" ? "Money In" : "Money Out"}
                        </Badge>
                        {!r.isMatched ? (
                          <Badge variant="outline" className="text-[10px]">
                            Unmatched
                          </Badge>
                        ) : null}
                        {r.reference ? (
                          <span className="text-[11px] font-mono text-muted-foreground line-clamp-1">
                            {r.reference}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* ─────────── Right pane: running summary ─────────── */}
      <Card className="self-start sticky top-4">
        <CardContent className="pt-5 pb-5 space-y-3">
          <div className="text-xs text-muted-foreground">
            Period: {format(new Date(startDate), "dd MMM yyyy")} →{" "}
            {format(new Date(endDate), "dd MMM yyyy")}
          </div>

          <Row
            label="Opening balance"
            value={formatMoney(openingBalance, currency)}
          />
          <Row
            label="+ Cleared Money In"
            value={formatMoney(summary.clearedIn, currency)}
            tone="emerald"
          />
          <Row
            label="− Cleared Money Out"
            value={formatMoney(summary.clearedOut, currency)}
            tone="rose"
          />
          <div className="border-t pt-2">
            <Row
              label="Cleared balance"
              value={formatMoney(summary.netCleared, currency)}
              bold
            />
          </div>
          <Row
            label="Statement closing"
            value={formatMoney(closingBalance, currency)}
            muted
          />

          <div className="border-t pt-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Difference</span>
              <span
                className={
                  "tabular-nums text-base font-semibold " +
                  (summary.balanced
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-amber-700 dark:text-amber-400")
                }
              >
                {formatMoney(summary.difference, currency)}
              </span>
            </div>
            {!summary.balanced ? (
              <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-1">
                Must be 0 to finalise. Tick / untick rows or adjust the closing
                balance.
              </p>
            ) : (
              <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-1 inline-flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" /> Balanced — ready to
                finalise.
              </p>
            )}
          </div>

          <div className="text-[11px] text-muted-foreground">
            {summary.clearedCount} cleared · {summary.unclearedCount} uncleared
          </div>

          {finalisingError ? (
            <div className="text-xs text-destructive inline-flex items-start gap-1">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5" />
              <span>{finalisingError}</span>
            </div>
          ) : null}

          {!readOnly ? (
            <Button
              type="button"
              className="w-full gap-1"
              onClick={handleFinalise}
              disabled={!summary.balanced || pending}
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Finish Reconciliation
            </Button>
          ) : (
            <Badge variant="outline" className="w-full justify-center py-2">
              Read-only
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  bold,
  muted,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "rose";
  bold?: boolean;
  muted?: boolean;
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "rose"
        ? "text-rose-700 dark:text-rose-400"
        : muted
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className={muted ? "text-muted-foreground" : "text-foreground"}>{label}</span>
      <span className={`tabular-nums ${cls} ${bold ? "font-semibold" : ""}`}>
        {value}
      </span>
    </div>
  );
}
