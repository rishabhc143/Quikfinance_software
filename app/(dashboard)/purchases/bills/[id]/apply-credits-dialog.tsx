"use client";

import * as React from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";

type Credit = {
  id: string;
  number: string;
  date: Date;
  total: number;
  remaining: number;
};

type Props = {
  billId: string;
  outstanding: number;
  currency: string;
  loadAction: (input: { billId: string }) => Promise<Credit[]>;
  applyAction: (input: {
    billId: string;
    applications: Array<{ vendorCreditId: string; amount: number }>;
  }) => Promise<unknown>;
  trigger: React.ReactNode;
};

/**
 * Apply Credits dialog on the Bill detail page (spec polish).
 * Inverse of the credit-side "Apply to Bill" dialog (PR #100):
 * shows vendor credits with remaining balance for the bill's
 * vendor, user picks which to apply and how much. Bounded by
 * min(credit.remaining, bill.outstanding).
 */
export function ApplyCreditsDialog({
  billId,
  outstanding,
  currency,
  loadAction,
  applyAction,
  trigger,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [credits, setCredits] = React.useState<Credit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [allocations, setAllocations] = React.useState<
    Record<string, number>
  >({});

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    loadAction({ billId })
      .then((rows) => {
        if (cancelled) return;
        setCredits(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(
          err instanceof Error ? err.message : "Couldn't load credits"
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, billId, loadAction]);

  const totalAllocated = Object.values(allocations).reduce(
    (s, n) => s + (Number.isFinite(n) ? n : 0),
    0
  );
  const overLimit = totalAllocated > outstanding + 0.001;

  function setAlloc(creditId: string, value: number) {
    setAllocations((prev) => {
      const next = { ...prev };
      if (!value || value < 0.001) delete next[creditId];
      else next[creditId] = value;
      return next;
    });
  }

  async function submit() {
    const applications = Object.entries(allocations)
      .filter(([, v]) => v > 0.001)
      .map(([vendorCreditId, amount]) => ({ vendorCreditId, amount }));
    if (applications.length === 0) {
      toast.error("Allocate at least one credit");
      return;
    }
    if (overLimit) {
      toast.error(
        `Allocation exceeds outstanding ${formatMoney(outstanding, currency)}`
      );
      return;
    }
    setBusy(true);
    try {
      await applyAction({ billId, applications });
      toast.success(
        `Applied ${formatMoney(totalAllocated, currency)} from ${
          applications.length
        } credit${applications.length === 1 ? "" : "s"}`
      );
      setOpen(false);
      setAllocations({});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apply vendor credits</DialogTitle>
          <DialogDescription>
            Outstanding on this bill:{" "}
            <strong className="tabular-nums">
              {formatMoney(outstanding, currency)}
            </strong>
            . Pick which credits to apply and how much from each.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-background overflow-x-auto">
          {loading ? (
            <div className="p-6 text-sm text-center text-muted-foreground">
              Loading credits…
            </div>
          ) : credits.length === 0 ? (
            <div className="p-6 text-sm text-center text-muted-foreground">
              No open vendor credits for this vendor.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="text-left">
                  <th className="p-2">Date</th>
                  <th className="p-2">Credit Note #</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 text-right">Remaining</th>
                  <th className="p-2 text-right">Apply</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {credits.map((c) => {
                  const value = allocations[c.id] ?? 0;
                  const max = Math.min(c.remaining, outstanding);
                  return (
                    <tr key={c.id}>
                      <td className="p-2 text-xs">
                        {format(c.date, "dd MMM yyyy")}
                      </td>
                      <td className="p-2 font-mono">{c.number}</td>
                      <td className="p-2 text-right tabular-nums">
                        {formatMoney(c.total, currency)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {formatMoney(c.remaining, currency)}
                      </td>
                      <td className="p-2 text-right">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max={max}
                          className="w-32 ml-auto text-right"
                          value={value || ""}
                          onChange={(e) => {
                            const n = Math.min(
                              Number(e.target.value),
                              c.remaining
                            );
                            setAlloc(c.id, n);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="text-sm bg-muted/30">
                <tr>
                  <td colSpan={4} className="p-2 text-right font-medium">
                    Total to apply
                  </td>
                  <td className="p-2 text-right tabular-nums font-semibold">
                    {formatMoney(totalAllocated, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        {overLimit ? (
          <p className="text-xs text-destructive">
            Allocation exceeds the bill&apos;s outstanding balance.
          </p>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={submit}
            disabled={busy || totalAllocated <= 0 || overLimit}
            className="gap-1"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
