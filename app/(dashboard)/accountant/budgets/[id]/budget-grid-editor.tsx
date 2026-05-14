"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  saveBudgetAmountsAction,
  type SaveBudgetAmountsInput,
} from "../actions";

type AccountRow = {
  accountId: string;
  accountName: string;
  accountCode: string | null;
  accountType: string;
  /** One amount per period bucket — index aligns with `bucketLabels`. */
  amounts: number[];
};

/**
 * ACCT-D.2 — Editable per-period grid for the Budget detail page.
 *
 * Rows = budgeted accounts; columns = period buckets (12 / 4 / 1
 * depending on Budget.budgetPeriod). Each cell is a numeric input
 * bound to the matching BudgetLine.amount. Save commits the whole
 * grid via `saveBudgetAmountsAction` in one transaction.
 */
export function BudgetGridEditor({
  budgetId,
  bucketLabels,
  initialRows,
  currencyCode,
}: {
  budgetId: string;
  bucketLabels: string[];
  initialRows: AccountRow[];
  currencyCode: string;
}) {
  const [rows, setRows] = React.useState<AccountRow[]>(initialRows);
  const [busy, setBusy] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  function setCell(rowIdx: number, periodIdx: number, value: string) {
    const n = value === "" ? 0 : Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    setRows((prev) => {
      const next = prev.map((r) => ({ ...r, amounts: r.amounts.slice() }));
      next[rowIdx].amounts[periodIdx] = n;
      return next;
    });
    setDirty(true);
  }

  const colTotals = React.useMemo(() => {
    return bucketLabels.map((_, i) =>
      rows.reduce((s, r) => s + (r.amounts[i] ?? 0), 0)
    );
  }, [rows, bucketLabels]);

  const rowTotals = React.useMemo(
    () => rows.map((r) => r.amounts.reduce((s, a) => s + (a ?? 0), 0)),
    [rows]
  );
  const grandTotal = colTotals.reduce((s, t) => s + t, 0);

  async function save() {
    setBusy(true);
    try {
      const cells: SaveBudgetAmountsInput["cells"] = [];
      for (const r of rows) {
        r.amounts.forEach((amount, i) => {
          cells.push({
            accountId: r.accountId,
            periodIndex: i,
            amount,
          });
        });
      }
      const res = await saveBudgetAmountsAction({ budgetId, cells });
      if (!res.ok) throw new Error(res.error ?? "Save failed");
      toast.success("Budget saved");
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function fmt(n: number): string {
    if (!n) return "0";
    return n.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Enter the budgeted amount per period. Currency: {currencyCode}.
        </div>
        <Button onClick={save} disabled={busy || !dirty} size="sm">
          {busy ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1.5" />
          )}
          Save
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3 sticky left-0 bg-muted/30 min-w-[14rem]">
                Account
              </th>
              {bucketLabels.map((lbl) => (
                <th key={lbl} className="text-right p-3 whitespace-nowrap">
                  {lbl}
                </th>
              ))}
              <th className="text-right p-3 whitespace-nowrap bg-muted/50">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, ri) => (
              <tr key={r.accountId} className="hover:bg-muted/20">
                <td className="p-3 sticky left-0 bg-background whitespace-nowrap">
                  {r.accountCode ? (
                    <span className="font-mono text-[11px] text-muted-foreground mr-1.5">
                      {r.accountCode}
                    </span>
                  ) : null}
                  {r.accountName}
                </td>
                {r.amounts.map((amount, pi) => (
                  <td key={pi} className="p-1.5">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amount || ""}
                      onChange={(e) => setCell(ri, pi, e.target.value)}
                      className="h-8 text-right tabular-nums w-24 ml-auto"
                    />
                  </td>
                ))}
                <td className="p-3 text-right tabular-nums font-medium bg-muted/30">
                  {fmt(rowTotals[ri])}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/40 font-medium">
            <tr>
              <td className="p-3 sticky left-0 bg-muted/40">Totals</td>
              {colTotals.map((t, i) => (
                <td key={i} className="p-3 text-right tabular-nums">
                  {fmt(t)}
                </td>
              ))}
              <td className="p-3 text-right tabular-nums bg-muted/60">
                {fmt(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
