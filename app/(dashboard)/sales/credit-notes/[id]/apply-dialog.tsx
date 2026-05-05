"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox } from "@/components/ui/combobox";
import { MoneyInput } from "@/components/shared/money-input";
import { toast } from "sonner";
import type { ApplyCreditInput } from "@/lib/validations/credit-note";

export function ApplyCreditDialog({
  creditNoteId,
  balance,
  openInvoices,
  action,
  trigger,
}: {
  creditNoteId: string;
  balance: number;
  openInvoices: { id: string; number: string; balance: number }[];
  action: (id: string, input: ApplyCreditInput) => Promise<unknown>;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [invoiceId, setInvoiceId] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState("0");

  async function submit() {
    if (!invoiceId) {
      toast.error("Pick an invoice");
      return;
    }
    if (Number(amount) <= 0) {
      toast.error("Amount must be positive");
      return;
    }
    setBusy(true);
    try {
      await action(creditNoteId, { invoiceId, amountApplied: Number(amount) });
      toast.success("Credit applied");
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Apply credit to invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">
            Available balance: {balance.toFixed(2)}
          </div>
          {openInvoices.length === 0 ? (
            <p className="text-sm">No open invoices for this customer.</p>
          ) : (
            <>
              <Label>Invoice</Label>
              <Combobox
                options={openInvoices.map((i) => ({
                  value: i.id,
                  label: i.number,
                  hint: `Balance: ${i.balance.toFixed(2)}`,
                }))}
                value={invoiceId}
                onChange={setInvoiceId}
                placeholder="Select invoice…"
              />
              <Label>Amount</Label>
              <MoneyInput value={amount} onChange={setAmount} />
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || openInvoices.length === 0} className="gap-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
