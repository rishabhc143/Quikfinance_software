"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export type OpenInvoiceLite = {
  id: string;
  number: string;
  total: number;
  amountPaid: number;
};

export function NewPaymentForm({
  contactOptions,
  bankAccountOptions,
  loadOpenInvoices,
  onSubmitAction,
}: {
  contactOptions: ComboboxOption[];
  bankAccountOptions: ComboboxOption[];
  loadOpenInvoices: (contactId: string) => Promise<OpenInvoiceLite[]>;
  onSubmitAction: (input: RecordPaymentInput) => Promise<unknown>;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [contactId, setContactId] = React.useState<string | null>(null);
  const [paymentDate, setPaymentDate] = React.useState<Date>(new Date());
  const [amountReceived, setAmountReceived] = React.useState("0");
  const [paymentMode, setPaymentMode] = React.useState("bank_transfer");
  const [depositToAccountId, setDepositToAccountId] = React.useState<string | null>(null);
  const [bankCharges, setBankCharges] = React.useState("0");
  const [tdsRate, setTdsRate] = React.useState("0");
  const [tdsAmount, setTdsAmount] = React.useState("0");
  const [emailNotification, setEmailNotification] = React.useState(false);
  const [useExcessAsCredit, setUseExcessAsCredit] = React.useState(true);
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [openInvoices, setOpenInvoices] = React.useState<OpenInvoiceLite[]>([]);
  const [allocations, setAllocations] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!contactId) {
      setOpenInvoices([]);
      setAllocations({});
      return;
    }
    loadOpenInvoices(contactId).then((rows) => {
      setOpenInvoices(rows);
      setAllocations(Object.fromEntries(rows.map((r) => [r.id, "0"])));
    });
  }, [contactId, loadOpenInvoices]);

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
    if (!contactId) {
      toast.error("Pick a customer");
      return;
    }
    if (Number(amountReceived) <= 0) {
      toast.error("Amount must be positive");
      return;
    }
    setBusy(true);
    try {
      await onSubmitAction({
        contactId,
        paymentDate: format(paymentDate, "yyyy-MM-dd") as unknown as Date,
        amountReceived: Number(amountReceived),
        paymentMode: paymentMode as RecordPaymentInput["paymentMode"],
        depositToAccountId,
        bankCharges: Number(bankCharges || 0),
        tdsRate: Number(tdsRate || 0),
        tdsAmount: Number(tdsAmount || 0),
        emailNotification,
        useExcessAsCredit,
        reference: reference || null,
        notes: notes || null,
        allocations: Object.entries(allocations)
          .filter(([, v]) => Number(v) > 0)
          .map(([invoiceId, amount]) => ({ invoiceId, amount: Number(amount) })),
      });
      toast.success("Payment recorded");
      router.push("/sales/payments-received");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-md border bg-card p-6 grid gap-4 md:grid-cols-[10rem_1fr]">
        <Label className="pt-2">Customer *</Label>
        <Combobox options={contactOptions} value={contactId} onChange={setContactId} placeholder="Select customer…" />

        <Label className="pt-2">Amount received *</Label>
        <MoneyInput value={amountReceived} onChange={setAmountReceived} />

        <Label className="pt-2">Payment date *</Label>
        <DatePicker value={paymentDate} onChange={(d) => d && setPaymentDate(d)} />

        <Label className="pt-2">Payment mode</Label>
        <Combobox
          options={PAYMENT_MODES}
          value={paymentMode}
          onChange={(v) => setPaymentMode(v ?? "bank_transfer")}
        />

        <Label className="pt-2">Deposit to</Label>
        <Combobox
          options={bankAccountOptions}
          value={depositToAccountId}
          onChange={setDepositToAccountId}
          placeholder="Optional"
        />

        <Label className="pt-2">Bank charges</Label>
        <MoneyInput value={bankCharges} onChange={setBankCharges} />

        <Label className="pt-2">Tax Deducted (TDS)</Label>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Rate (%)</span>
            <Input
              inputMode="decimal"
              value={tdsRate}
              onChange={(e) => setTdsRate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Amount</span>
            <MoneyInput value={tdsAmount} onChange={setTdsAmount} />
          </div>
        </div>

        <Label className="pt-2">Reference #</Label>
        <Input value={reference} onChange={(e) => setReference(e.target.value)} />

        <Label className="pt-2">Notes</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />

        <Label className="pt-2">Excess handling</Label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useExcessAsCredit}
            onChange={(e) => setUseExcessAsCredit(e.target.checked)}
          />
          Use excess amount as customer credit (otherwise mark for refund)
        </label>

        <Label className="pt-2">Email Notification</Label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={emailNotification}
            onChange={(e) => setEmailNotification(e.target.checked)}
          />
          Email a payment confirmation to the customer
        </label>
      </section>

      {contactId ? (
        <section className="rounded-md border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Apply to invoices</h2>
            <Button type="button" variant="link" size="sm" onClick={autoAllocateOldest}>
              Auto-allocate oldest first
            </Button>
          </div>
          {openInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No unpaid invoices for this customer. The full amount will be recorded
              as customer credit.
            </p>
          ) : (
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
                            setAllocations({ ...allocations, [inv.id]: e.target.value })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      <div className="flex items-center gap-2 sticky bottom-0 bg-background border-t -mx-6 px-6 py-3">
        <Button onClick={submit} disabled={busy} className="gap-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Record payment
        </Button>
        <Button variant="ghost" onClick={() => router.push("/sales/payments-received")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
