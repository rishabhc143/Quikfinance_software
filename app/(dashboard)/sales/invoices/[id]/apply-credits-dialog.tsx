"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export type OpenCredit = {
  id: string;
  number: string;
  date: string;
  balance: number;
};

export function ApplyCreditsDialog({
  invoiceId,
  invoiceBalance,
  openCredits,
  currency,
  action,
  trigger,
}: {
  invoiceId: string;
  invoiceBalance: number;
  openCredits: OpenCredit[];
  currency: string;
  action: (
    invoiceId: string,
    applications: { creditNoteId: string; amount: number }[]
  ) => Promise<unknown>;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [allocations, setAllocations] = React.useState<Record<string, string>>(
    () => Object.fromEntries(openCredits.map((c) => [c.id, "0"]))
  );

  function autoAllocateOldest() {
    let remaining = invoiceBalance;
    const next: Record<string, string> = {};
    for (const c of openCredits) {
      if (remaining <= 0) {
        next[c.id] = "0";
        continue;
      }
      const apply = Math.min(remaining, c.balance);
      next[c.id] = apply.toFixed(2);
      remaining -= apply;
    }
    setAllocations(next);
  }

  const total = Object.values(allocations).reduce(
    (s, v) => s + (Number(v) || 0),
    0
  );

  async function submit() {
    if (total <= 0) {
      toast.error("Apply at least one credit");
      return;
    }
    if (total > invoiceBalance + 0.0001) {
      toast.error("Applied amount exceeds invoice balance");
      return;
    }
    setBusy(true);
    try {
      await action(
        invoiceId,
        Object.entries(allocations)
          .filter(([, v]) => Number(v) > 0)
          .map(([creditNoteId, amount]) => ({
            creditNoteId,
            amount: Number(amount),
          }))
      );
      toast.success("Credits applied");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Apply credits to invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Invoice balance: {invoiceBalance.toFixed(2)} {currency}
            </span>
            {openCredits.length > 0 ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={autoAllocateOldest}
              >
                Auto-allocate oldest first
              </Button>
            ) : null}
          </div>
          {openCredits.length === 0 ? (
            <p className="text-sm">No open credit notes for this customer.</p>
          ) : (
            <div className="rounded-md border bg-muted/20 p-3">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left p-1">Credit note</th>
                    <th className="text-left p-1">Date</th>
                    <th className="text-right p-1">Balance</th>
                    <th className="text-right p-1">Apply</th>
                  </tr>
                </thead>
                <tbody>
                  {openCredits.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="p-1 font-mono">{c.number}</td>
                      <td className="p-1">{c.date}</td>
                      <td className="p-1 text-right tabular-nums">
                        {c.balance.toFixed(2)}
                      </td>
                      <td className="p-1">
                        <Input
                          inputMode="decimal"
                          className="h-8 text-right"
                          value={allocations[c.id] ?? ""}
                          onChange={(e) =>
                            setAllocations({
                              ...allocations,
                              [c.id]: e.target.value,
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-xs text-muted-foreground pt-2 mt-2 border-t flex justify-between">
                <span>Total applying:</span>
                <span className="font-medium">{total.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy || openCredits.length === 0}
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
