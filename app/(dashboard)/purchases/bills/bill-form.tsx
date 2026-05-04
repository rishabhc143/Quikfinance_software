"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { formatMoney, currencySymbol } from "@/lib/money";
import { toast } from "sonner";
import { format } from "date-fns";

export type Line = { itemId: string | null; description: string; quantity: number; rate: number };
export type BillFormValues = {
  contactId: string | null;
  status: "DRAFT" | "OPEN" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";
  issueDate: string;
  dueDate: string;
  notes: string;
  lines: Line[];
};

export function BillForm({
  initial, currency, onSubmit, submitLabel = "Save", title = "New Bill",
  vendorOptions, itemOptions,
}: {
  initial?: Partial<BillFormValues>; currency: string;
  onSubmit: (values: BillFormValues) => Promise<unknown>;
  submitLabel?: string; title?: string;
  vendorOptions: ComboboxOption[];
  itemOptions: { value: string; label: string; costPrice: number | null; description: string | null }[];
}) {
  const router = useRouter();
  const today = format(new Date(), "yyyy-MM-dd");
  const due = format(new Date(Date.now() + 30 * 86400000), "yyyy-MM-dd");
  const [v, setV] = React.useState<BillFormValues>({
    contactId: null, status: "DRAFT", issueDate: today, dueDate: due, notes: "",
    lines: [{ itemId: null, description: "", quantity: 1, rate: 0 }], ...initial,
  });
  const [busy, setBusy] = React.useState(false);

  function setField<K extends keyof BillFormValues>(k: K, val: BillFormValues[K]) { setV((s) => ({ ...s, [k]: val })); }
  function setLine(i: number, patch: Partial<Line>) { setV((s) => ({ ...s, lines: s.lines.map((l, idx) => idx === i ? { ...l, ...patch } : l) })); }
  function addLine() { setV((s) => ({ ...s, lines: [...s.lines, { itemId: null, description: "", quantity: 1, rate: 0 }] })); }
  function removeLine(i: number) { setV((s) => ({ ...s, lines: s.lines.filter((_, idx) => idx !== i) })); }
  function pickItem(i: number, itemId: string | null) {
    if (!itemId) { setLine(i, { itemId: null }); return; }
    const item = itemOptions.find((o) => o.value === itemId);
    setLine(i, { itemId, description: item?.description ?? item?.label ?? v.lines[i].description, rate: item?.costPrice ?? v.lines[i].rate });
  }

  const subtotal = v.lines.reduce((acc, l) => acc + l.quantity * l.rate, 0);
  const sym = currencySymbol(currency);

  async function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!v.contactId) { toast.error("Pick a vendor"); return; }
    if (v.lines.some((l) => !l.description.trim())) { toast.error("Each line needs a description"); return; }
    setBusy(true);
    try { await onSubmit(v); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); setBusy(false); }
  }

  return (
    <form onSubmit={handle} className="space-y-5">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label>Vendor <span className="text-destructive">*</span></Label>
          <Combobox options={vendorOptions} value={v.contactId} onChange={(x) => setField("contactId", x)} placeholder="Select vendor" />
        </div>
        <div>
          <Label>Status</Label>
          <select value={v.status} onChange={(e) => setField("status", e.target.value as BillFormValues["status"])} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            {(["DRAFT", "OPEN", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"] as const).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Issue date</Label><Input type="date" value={v.issueDate} onChange={(e) => setField("issueDate", e.target.value)} required /></div>
          <div><Label>Due date</Label><Input type="date" value={v.dueDate} onChange={(e) => setField("dueDate", e.target.value)} required /></div>
        </div>
      </div>

      <div className="rounded-md border bg-background overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="text-left p-2 w-1/3">Item / Description</th><th className="text-right p-2 w-24">Qty</th><th className="text-right p-2 w-32">Rate</th><th className="text-right p-2 w-32">Amount</th><th className="w-8" /></tr>
          </thead>
          <tbody className="divide-y">
            {v.lines.map((l, i) => (
              <tr key={i}>
                <td className="p-2 align-top">
                  <Combobox options={itemOptions.map((o) => ({ value: o.value, label: o.label, hint: o.costPrice ? `${sym}${o.costPrice}` : undefined }))} value={l.itemId} onChange={(x) => pickItem(i, x)} placeholder="Pick item" />
                  <Textarea rows={1} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="Description" className="mt-1" required />
                </td>
                <td className="p-2 align-top"><Input type="number" step="0.01" min="0" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} className="text-right" /></td>
                <td className="p-2 align-top"><Input type="number" step="0.01" min="0" value={l.rate} onChange={(e) => setLine(i, { rate: Number(e.target.value) })} className="text-right" /></td>
                <td className="p-2 text-right tabular-nums align-top pt-3">{formatMoney(l.quantity * l.rate, currency)}</td>
                <td className="p-2 align-top">
                  {v.lines.length > 1 && <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-2 border-t flex items-center justify-between bg-muted/30">
          <Button type="button" variant="ghost" size="sm" onClick={addLine}><Plus className="h-3.5 w-3.5 mr-1" /> Add line</Button>
          <div className="text-right text-base">
            <span className="text-muted-foreground mr-3">Total</span>
            <strong className="tabular-nums">{formatMoney(subtotal, currency)}</strong>
          </div>
        </div>
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea rows={2} value={v.notes} onChange={(e) => setField("notes", e.target.value)} />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={() => router.push("/purchases/bills")} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{submitLabel}</Button>
      </div>
    </form>
  );
}
