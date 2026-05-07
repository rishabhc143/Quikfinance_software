"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/shared/date-picker";
import { MoneyInput } from "@/components/shared/money-input";
import { format } from "date-fns";
import { toast } from "sonner";
import type { RecordPaymentInput } from "@/lib/validations/invoice";

const PAYMENT_MODES: ComboboxOption[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "credit_card", label: "Credit Card" },
  { value: "upi", label: "UPI" },
  { value: "other", label: "Other" },
];

export type OpenInvoice = {
  id: string;
  number: string;
  total: number;
  amountPaid: number;
};

export function RecordPaymentDialog({
  contactId,
  contactName,
  currentInvoiceId,
  openInvoices,
  bankAccountOptions,
  action,
  trigger,
}: {
  contactId: string;
  contactName: string;
  currentInvoiceId: string;
  openInvoices: OpenInvoice[];
  bankAccountOptions: ComboboxOption[];
  action: (input: RecordPaymentInput) => Promise<unknown>;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [paymentDate, setPaymentDate] = React.useState<Date>(new Date());
  const [amountReceived, setAmountReceived] = React.useState("0");
  const [paymentMode, setPaymentMode] = React.useState<string>("bank_transfer");
  const [depositToAccountId, setDepositToAccountId] = React.useState<string | null>(null);
  const [bankCharges, setBankCharges] = React.useState("0");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [allocations, setAllocations] = React.useState<Record<string, string>>(
    () => {
      const initial: Record<string, string> = {};
      const due = openInvoices.find((i) => i.id === currentInvoiceId);
      if (due) {
        const balance = due.total - due.amountPaid;
        initial[currentInvoiceId] = balance.toString();
      }
      return initial;
    }
  );

  const allocatedTotal = Object.values(allocations).reduce(
    (s, v) => s + (Number(v) || 0),
    0
  );
  const excess = Math.max(0, Number(amountReceived) - allocatedTotal);

  function autoAllocateOldest() {
    let remaining = Number(amountReceived);
    const next: Record<string, string> = {};
    for (const inv of openInvoices) {
      if (remaining <= 0) {
        next[inv.id] = "0";
        continue;
      }
      const due = inv.total - inv.amountPaid;
      const allocate = Math.min(remaining, due);
      next[inv.id] = allocate.toFixed(2);
      remaining -= allocate;
    }
    setAllocations(next);
  }

  async function submit() {
    if (Number(amountReceived) <= 0) {
      toast.error("Amount received must be positive");
      return;
    }
    setBusy(true);
    try {
      await action({
        contactId,
        paymentDate: format(paymentDate, "yyyy-MM-dd") as unknown as Date,
        amountReceived: Number(amountReceived),
        paymentMode: paymentMode as RecordPaymentInput["paymentMode"],
        depositToAccountId,
        bankCharges: Number(bankCharges || 0),
        reference: reference || null,
        notes: notes || null,
        allocations: Object.entries(allocations)
          .filter(([, v]) => Number(v) > 0)
          .map(([invoiceId, amount]) => ({ invoiceId, amount: Number(amount) })),
      });
      toast.success("Payment recorded");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>From {contactName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Payment date</Label>
              <DatePicker value={paymentDate} onChange={(d) => d && setPaymentDate(d)} />
            </div>
            <div>
              <Label>Amount received</Label>
              <MoneyInput
                value={amountReceived}
                onChange={setAmountReceived}
                data-testid="payment-amount-input"
              />
            </div>
            <div>
              <Label>Payment mode</Label>
              <Combobox
                options={PAYMENT_MODES}
                value={paymentMode}
                onChange={(v) => setPaymentMode(v ?? "bank_transfer")}
              />
            </div>
            <div>
              <Label>Deposit to</Label>
              <Combobox
                options={bankAccountOptions}
                value={depositToAccountId}
                onChange={setDepositToAccountId}
                placeholder="Optional"
              />
            </div>
            <div>
              <Label>Reference #</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            <div>
              <Label>Bank charges</Label>
              <MoneyInput value={bankCharges} onChange={setBankCharges} />
            </div>
          </div>

          <div className="rounded-md border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <Label>Apply to invoices</Label>
              <Button type="button" variant="link" size="sm" onClick={autoAllocateOldest}>
                Auto-allocate oldest first
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left p-1">Invoice</th>
                  <th className="text-right p-1">Total</th>
                  <th className="text-right p-1">Balance</th>
                  <th className="text-right p-1">Apply</th>
                </tr>
              </thead>
              <tbody>
                {openInvoices.map((inv) => {
                  const balance = inv.total - inv.amountPaid;
                  return (
                    <tr key={inv.id} className="border-t">
                      <td className="p-1 font-mono">{inv.number}</td>
                      <td className="p-1 text-right tabular-nums">
                        {inv.total.toFixed(2)}
                      </td>
                      <td className="p-1 text-right tabular-nums">{balance.toFixed(2)}</td>
                      <td className="p-1">
                        <Input
                          inputMode="decimal"
                          className="h-8 text-right"
                          value={allocations[inv.id] ?? ""}
                          onChange={(e) =>
                            setAllocations({
                              ...allocations,
                              [inv.id]: e.target.value,
                            })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
              <span>Allocated: {allocatedTotal.toFixed(2)}</span>
              {excess > 0 ? (
                <span>
                  Excess will be recorded as customer credit: {excess.toFixed(2)}
                </span>
              ) : null}
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy}
            className="gap-1"
            data-testid="record-payment-submit"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
