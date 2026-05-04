"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { formatMoney } from "@/lib/money";
import { type PaymentMadeInput } from "../actions";
import { toast } from "sonner";

type Bill = { id: string; number: string; total: number; amountPaid: number; dueDate: string };

export function PaymentMadeForm({
  vendors, bankAccounts, currency, defaultVendorId, defaultBillId, defaultDate, onSubmitAction,
}: {
  vendors: { id: string; displayName: string }[];
  bankAccounts: { id: string; name: string }[];
  currency: string;
  defaultVendorId: string | null;
  defaultBillId: string | null;
  defaultDate: string;
  onSubmitAction: (input: PaymentMadeInput) => Promise<unknown>;
}) {
  const router = useRouter();
  const [contactId, setContactId] = React.useState<string | null>(defaultVendorId);
  const [paymentDate, setPaymentDate] = React.useState(defaultDate);
  const [method, setMethod] = React.useState("Bank transfer");
  const [reference, setReference] = React.useState("");
  const [bankAccountId, setBankAccountId] = React.useState<string | null>(bankAccounts[0]?.id ?? null);
  const [notes, setNotes] = React.useState("");
  const [openBills, setOpenBills] = React.useState<Bill[]>([]);
  const [allocations, setAllocations] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!contactId) { setOpenBills([]); setAllocations({}); return; }
    setLoading(true);
    fetch(`/api/vendors/${contactId}/open-bills`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: Bill[]) => {
        setOpenBills(data);
        if (defaultBillId && data.find((b) => b.id === defaultBillId)) {
          const bill = data.find((b) => b.id === defaultBillId)!;
          setAllocations({ [bill.id]: bill.total - bill.amountPaid });
        }
      })
      .catch(() => setOpenBills([]))
      .finally(() => setLoading(false));
  }, [contactId, defaultBillId]);

  const totalAmount = Object.values(allocations).reduce((s, n) => s + (Number.isFinite(n) ? n : 0), 0);

  function setAlloc(billId: string, value: number) {
    setAllocations((prev) => {
      const next = { ...prev };
      if (!value) delete next[billId];
      else next[billId] = value;
      return next;
    });
  }

  function autoAllocate() {
    const next: Record<string, number> = {};
    for (const b of openBills) {
      const out = b.total - b.amountPaid;
      if (out > 0.001) next[b.id] = out;
    }
    setAllocations(next);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!contactId) { toast.error("Pick a vendor"); return; }
    const allocs = Object.entries(allocations).filter(([, amt]) => amt > 0).map(([billId, amount]) => ({ billId, amount }));
    if (allocs.length === 0) { toast.error("Allocate at least one bill"); return; }
    setBusy(true);
    try {
      await onSubmitAction({
        contactId, paymentDate: new Date(paymentDate),
        method: method || null, reference: reference || null,
        bankAccountId, notes: notes || null, allocations: allocs,
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
          <Label>Vendor <span className="text-destructive">*</span></Label>
          <Combobox options={vendors.map((v) => ({ value: v.id, label: v.displayName }))} value={contactId} onChange={setContactId} placeholder="Select vendor" />
        </div>
        <div><Label>Payment date</Label><Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required /></div>
        <div>
          <Label>Method</Label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option>Bank transfer</option><option>Cash</option><option>Cheque</option><option>Credit card</option><option>UPI</option><option>Other</option>
          </select>
        </div>
        <div>
          <Label>Bank account</Label>
          <select value={bankAccountId ?? ""} onChange={(e) => setBankAccountId(e.target.value || null)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="">— None —</option>
            {bankAccounts.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="md:col-span-2"><Label>Reference</Label><Input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
      </div>

      <div className="rounded-md border bg-background overflow-hidden">
        <div className="px-3 py-2 border-b bg-muted/30 flex items-center justify-between">
          <h3 className="text-sm font-medium">Apply against open bills</h3>
          {openBills.length > 0 && <Button type="button" variant="outline" size="sm" onClick={autoAllocate}>Auto-allocate all</Button>}
        </div>
        {!contactId ? (
          <div className="p-6 text-sm text-center text-muted-foreground">Pick a vendor to see their open bills.</div>
        ) : loading ? (
          <div className="p-6 text-sm text-center text-muted-foreground">Loading…</div>
        ) : openBills.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No open bills for this vendor.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left p-3">Bill</th><th className="text-left p-3">Due</th><th className="text-right p-3">Total</th><th className="text-right p-3">Outstanding</th><th className="text-right p-3">Apply</th></tr>
            </thead>
            <tbody className="divide-y">
              {openBills.map((b) => {
                const outstanding = b.total - b.amountPaid;
                const value = allocations[b.id] ?? 0;
                return (
                  <tr key={b.id}>
                    <td className="p-3 font-mono">{b.number}</td>
                    <td className="p-3 text-xs text-muted-foreground">{new Date(b.dueDate).toLocaleDateString()}</td>
                    <td className="p-3 text-right tabular-nums">{formatMoney(b.total, currency)}</td>
                    <td className="p-3 text-right tabular-nums">{formatMoney(outstanding, currency)}</td>
                    <td className="p-3 text-right">
                      <Input type="number" step="0.01" min="0" max={outstanding} className="w-32 ml-auto text-right" value={value || ""}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (n > outstanding) setAlloc(b.id, outstanding);
                          else setAlloc(b.id, n);
                        }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted/20 text-sm">
              <tr><td colSpan={4} className="p-3 text-right font-medium">Total payment amount</td><td className="p-3 text-right tabular-nums font-semibold">{formatMoney(totalAmount, currency)}</td></tr>
            </tfoot>
          </table>
        )}
      </div>

      <div><Label>Notes</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={() => router.push("/purchases/payments-made")} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy || totalAmount <= 0}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Record {totalAmount > 0 ? formatMoney(totalAmount, currency) : "payment"}
        </Button>
      </div>
    </form>
  );
}
