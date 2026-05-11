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
import type { ApplyVendorCreditInput } from "@/lib/validations/vendor-credit";

type Bill = {
  id: string;
  number: string;
  issueDate: Date;
  dueDate: Date;
  total: number;
  amountPaid: number;
  amountDue: number;
};

type Props = {
  vendorCreditId: string;
  currency: string;
  remaining: number;
  loadAction: (input: { vendorCreditId: string }) => Promise<Bill[]>;
  applyAction: (input: ApplyVendorCreditInput) => Promise<unknown>;
  trigger: React.ReactNode;
};

/**
 * Apply Vendor Credit dialog. Loads the vendor's open bills, lets the
 * user allocate up to `remaining` across them. Server action enforces
 * the same cap + flips bill balances + credit status to CLOSED when
 * fully consumed.
 */
export function ApplyToBillDialog({
  vendorCreditId,
  currency,
  remaining,
  loadAction,
  applyAction,
  trigger,
}: Props) {
  const [open, setOpen] = React.useState(false);
  const [bills, setBills] = React.useState<Bill[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [allocations, setAllocations] = React.useState<Record<string, number>>(
    {}
  );

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    loadAction({ vendorCreditId })
      .then((rows) => {
        if (cancelled) return;
        setBills(rows);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(
          err instanceof Error ? err.message : "Couldn't load bills"
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, vendorCreditId, loadAction]);

  const totalAllocated = Object.values(allocations).reduce(
    (s, n) => s + (Number.isFinite(n) ? n : 0),
    0
  );
  const overLimit = totalAllocated > remaining + 0.001;

  function setAlloc(billId: string, value: number) {
    setAllocations((prev) => {
      const next = { ...prev };
      if (!value || value < 0.001) delete next[billId];
      else next[billId] = value;
      return next;
    });
  }

  async function submit() {
    const applications = Object.entries(allocations)
      .filter(([, v]) => v > 0.001)
      .map(([billId, amount]) => ({ billId, amount }));
    if (applications.length === 0) {
      toast.error("Allocate to at least one bill");
      return;
    }
    if (overLimit) {
      toast.error(
        `Allocation exceeds remaining ${formatMoney(remaining, currency)}`
      );
      return;
    }
    setBusy(true);
    try {
      await applyAction({
        vendorCreditId,
        applications,
        appliedDate: new Date(),
      });
      toast.success(
        `Applied ${formatMoney(totalAllocated, currency)} to ${
          applications.length
        } bill${applications.length === 1 ? "" : "s"}`
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
          <DialogTitle>Apply credit to bill(s)</DialogTitle>
          <DialogDescription>
            Allocate up to{" "}
            <strong className="tabular-nums">
              {formatMoney(remaining, currency)}
            </strong>{" "}
            across the vendor&apos;s open bills.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border bg-background overflow-x-auto">
          {loading ? (
            <div className="p-6 text-sm text-center text-muted-foreground">
              Loading bills…
            </div>
          ) : bills.length === 0 ? (
            <div className="p-6 text-sm text-center text-muted-foreground">
              No open bills for this vendor.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="text-left">
                  <th className="p-2">Date</th>
                  <th className="p-2">Bill #</th>
                  <th className="p-2 text-right">Total</th>
                  <th className="p-2 text-right">Due</th>
                  <th className="p-2 text-right">Apply</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {bills.map((b) => {
                  const value = allocations[b.id] ?? 0;
                  const max = Math.min(b.amountDue, remaining);
                  return (
                    <tr key={b.id}>
                      <td className="p-2 text-xs">
                        {format(b.issueDate, "dd MMM yyyy")}
                      </td>
                      <td className="p-2 font-mono">{b.number}</td>
                      <td className="p-2 text-right tabular-nums">
                        {formatMoney(b.total, currency)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {formatMoney(b.amountDue, currency)}
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
                              b.amountDue
                            );
                            setAlloc(b.id, n);
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
            Allocation exceeds the remaining credit balance.
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
