"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { formatMoney, currencySymbol } from "@/lib/money";
import { type PaymentReceivedInput } from "../actions";
import { toast } from "sonner";

type Invoice = {
  id: string;
  number: string;
  total: number;
  amountPaid: number;
  dueDate: string;
};

type Props = {
  customers: { id: string; displayName: string }[];
  bankAccounts: { id: string; name: string }[];
  currency: string;
  defaultCustomerId: string | null;
  defaultInvoiceId: string | null;
  defaultDate: string;
  onSubmitAction: (input: PaymentReceivedInput) => Promise<unknown>;
};

export function PaymentReceivedForm({ customers, bankAccounts, currency, defaultCustomerId, defaultInvoiceId, defaultDate, onSubmitAction }: Props) {
  const router = useRouter();
  const [contactId, setContactId] = React.useState<string | null>(defaultCustomerId);
  const [paymentDate, setPaymentDate] = React.useState(defaultDate);
  const [method, setMethod] = React.useState("Bank transfer");
  const [reference, setReference] = React.useState("");
  const [bankAccountId, setBankAccountId] = React.useState<string | null>(bankAccounts[0]?.id ?? null);
  const [notes, setNotes] = React.useState("");
  const [openInvoices, setOpenInvoices] = React.useState<Invoice[]>([]);
  const [allocations, setAllocations] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Fetch open invoices when customer changes
  React.useEffect(() => {
    if (!contactId) { setOpenInvoices([]); setAllocations({}); return; }
    setLoading(true);
    fetch(`/api/customers/${contactId}/open-invoices`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: Invoice[]) => {
        setOpenInvoices(data);
        // Pre-allocate from URL param if provided, else default to outstanding for the first invoice
        if (defaultInvoiceId && data.find((i) => i.id === defaultInvoiceId)) {
          const inv = data.find((i) => i.id === defaultInvoiceId)!;
          setAllocations({ [inv.id]: inv.total - inv.amountPaid });
        } else {
          setAllocations({});
        }
      })
      .catch(() => setOpenInvoices([]))
      .finally(() => setLoading(false));
  }, [contactId, defaultInvoiceId]);

  const totalAmount = Object.values(allocations).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);

  function setAlloc(invoiceId: string, value: number) {
    setAllocations((prev) => {
      const next = { ...prev };
      if (!value) delete next[invoiceId];
      else next[invoiceId] = value;
      return next;
    });
  }

  function autoAllocate() {
    // Allocate full outstanding to oldest invoices first up to a target you'd type — simple version: fill each
    const next: Record<string, number> = {};
    for (const inv of openInvoices) {
      const out = inv.total - inv.amountPaid;
      if (out > 0.001) next[inv.id] = out;
    }
    setAllocations(next);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!contactId) { toast.error("Pick a customer"); return; }
    const allocs = Object.entries(allocations).filter(([, amt]) => amt > 0).map(([invoiceId, amount]) => ({ invoiceId, amount }));
    if (allocs.length === 0) { toast.error("Allocate at least one invoice"); return; }
    setBusy(true);
    try {
      await onSubmitAction({
        contactId, paymentDate: new Date(paymentDate),
        method: method || null, reference: reference || null,
        bankAccountId: bankAccountId, notes: notes || null,
        allocations: allocs,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Customer <span className="text-destructive">*</span></Label>
          <Combobox
            options={customers.map((c) => ({ value: c.id, label: c.displayName }))}
            value={contactId}
            onChange={setContactId}
            placeholder="Select customer"
          />
        </div>
        <div>
          <Label>Payment date <span className="text-destructive">*</span></Label>
          <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required />
        </div>
        <div>
          <Label>Method</Label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option>Bank transfer</option><option>Cash</option><option>Cheque</option>
            <option>Credit card</option><option>UPI</option><option>Other</option>
          </select>
        </div>
        <div>
          <Label>Bank account</Label>
          <select value={bankAccountId ?? ""} onChange={(e) => setBankAccountId(e.target.value || null)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">— None —</option>
            {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <Label>Reference</Label>
          <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Cheque #, txn ref, etc." />
        </div>
      </div>

      <div className="rounded-md border bg-background overflow-hidden">
        <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
          <h3 className="text-sm font-medium">Apply against open invoices</h3>
          {openInvoices.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={autoAllocate}>Auto-allocate all</Button>
          )}
        </div>
        {!contactId ? (
          <div className="p-6 text-sm text-center text-muted-foreground">Pick a customer to see their open invoices.</div>
        ) : loading ? (
          <div className="p-6 text-sm text-center text-muted-foreground">Loading…</div>
        ) : openInvoices.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No open invoices for this customer.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3">Invoice</th>
                <th className="text-left p-3">Due</th>
                <th className="text-right p-3">Total</th>
                <th className="text-right p-3">Outstanding</th>
                <th className="text-right p-3">Apply</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {openInvoices.map((inv) => {
                const outstanding = inv.total - inv.amountPaid;
                const value = allocations[inv.id] ?? 0;
                return (
                  <tr key={inv.id}>
                    <td className="p-3 font-mono">{inv.number}</td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(inv.dueDate).toLocaleDateString()}</td>
                    <td className="p-3 text-right tabular-nums">{formatMoney(inv.total, currency)}</td>
                    <td className="p-3 text-right tabular-nums">{formatMoney(outstanding, currency)}</td>
                    <td className="p-3 text-right">
                      <Input
                        type="number" step="0.01" min="0" max={outstanding}
                        className="w-32 ml-auto text-right"
                        value={value || ""}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (n > outstanding) setAlloc(inv.id, outstanding);
                          else setAlloc(inv.id, n);
                        }}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted/20 text-sm">
              <tr>
                <td colSpan={4} className="p-3 text-right font-medium">Total payment amount</td>
                <td className="p-3 text-right tabular-nums font-semibold">{formatMoney(totalAmount, currency)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={() => router.push("/sales/payments-received")} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy || totalAmount <= 0}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Record {totalAmount > 0 ? formatMoney(totalAmount, currency) : "payment"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Currency symbol: {currencySymbol(currency)}</p>
    </form>
  );
}
