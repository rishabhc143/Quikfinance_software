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

export type InvoiceFormValues = {
  contactId: string | null;
  status: "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID";
  issueDate: string; // yyyy-MM-dd
  dueDate: string;
  notes: string;
  terms: string;
  lines: Line[];
};

type Submit = (values: InvoiceFormValues) => Promise<unknown>;

export function InvoiceForm({
  initial, currency, onSubmit, submitLabel = "Save", title = "New Invoice",
  contactOptions, itemOptions,
}: {
  initial?: Partial<InvoiceFormValues>;
  currency: string;
  onSubmit: Submit;
  submitLabel?: string;
  title?: string;
  contactOptions: ComboboxOption[];
  itemOptions: { value: string; label: string; sellingPrice: number | null; description: string | null }[];
}) {
  const router = useRouter();
  const today = format(new Date(), "yyyy-MM-dd");
  const due = format(new Date(Date.now() + 30 * 86400000), "yyyy-MM-dd");
  const [v, setV] = React.useState<InvoiceFormValues>({
    contactId: null, status: "DRAFT", issueDate: today, dueDate: due, notes: "", terms: "",
    lines: [{ itemId: null, description: "", quantity: 1, rate: 0 }],
    ...initial,
  });
  const [busy, setBusy] = React.useState(false);

  function setField<K extends keyof InvoiceFormValues>(k: K, val: InvoiceFormValues[K]) { setV((s) => ({ ...s, [k]: val })); }
  function setLine(i: number, patch: Partial<Line>) { setV((s) => ({ ...s, lines: s.lines.map((l, idx) => idx === i ? { ...l, ...patch } : l) })); }
  function addLine() { setV((s) => ({ ...s, lines: [...s.lines, { itemId: null, description: "", quantity: 1, rate: 0 }] })); }
  function removeLine(i: number) { setV((s) => ({ ...s, lines: s.lines.filter((_, idx) => idx !== i) })); }

  const subtotal = v.lines.reduce((acc, l) => acc + l.quantity * l.rate, 0);

  function pickItem(i: number, itemId: string | null) {
    if (!itemId) { setLine(i, { itemId: null }); return; }
    const item = itemOptions.find((o) => o.value === itemId);
    setLine(i, {
      itemId,
      description: item?.description ?? item?.label ?? v.lines[i].description,
      rate: item?.sellingPrice ?? v.lines[i].rate,
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!v.contactId) { toast.error("Pick a customer"); return; }
    if (v.lines.length === 0 || v.lines.some((l) => !l.description.trim())) { toast.error("Each line needs a description"); return; }
    setBusy(true);
    try { await onSubmit(v); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); setBusy(false); }
  }

  const sym = currencySymbol(currency);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h1 className="text-xl font-semibold">{title}</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <Label>Customer <span className="text-destructive">*</span></Label>
          <Combobox options={contactOptions} value={v.contactId} onChange={(x) => setField("contactId", x)} placeholder="Select customer" />
        </div>
        <div>
          <Label>Status</Label>
          <select value={v.status} onChange={(e) => setField("status", e.target.value as InvoiceFormValues["status"])} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            {(["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"] as const).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Issue date</Label>
            <Input type="date" value={v.issueDate} onChange={(e) => setField("issueDate", e.target.value)} required />
          </div>
          <div>
            <Label>Due date</Label>
            <Input type="date" value={v.dueDate} onChange={(e) => setField("dueDate", e.target.value)} required />
          </div>
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
                  <Combobox
                    options={itemOptions.map((o) => ({ value: o.value, label: o.label, hint: o.sellingPrice ? `${sym}${o.sellingPrice}` : undefined }))}
                    value={l.itemId}
                    onChange={(x) => pickItem(i, x)}
                    placeholder="Pick item or type below"
                  />
                  <Textarea
                    rows={1}
                    placeholder="Description"
                    value={l.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                    className="mt-1"
                    required
                  />
                </td>
                <td className="p-2 align-top">
                  <Input type="number" step="0.01" min="0" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} className="text-right" />
                </td>
                <td className="p-2 align-top">
                  <Input type="number" step="0.01" min="0" value={l.rate} onChange={(e) => setLine(i, { rate: Number(e.target.value) })} className="text-right" />
                </td>
                <td className="p-2 text-right tabular-nums align-top pt-3">{formatMoney(l.quantity * l.rate, currency)}</td>
                <td className="p-2 align-top">
                  {v.lines.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeLine(i)} aria-label="Remove line">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-2 border-t flex items-center justify-between bg-muted/30">
          <Button type="button" variant="ghost" size="sm" onClick={addLine}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add line
          </Button>
          <div className="text-right text-sm space-y-1">
            <div className="flex items-center justify-between gap-8">
              <span className="text-muted-foreground">Subtotal</span>
              <strong className="tabular-nums">{formatMoney(subtotal, currency)}</strong>
            </div>
            <div className="flex items-center justify-between gap-8 text-base">
              <span className="text-muted-foreground">Total</span>
              <strong className="tabular-nums">{formatMoney(subtotal, currency)}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label>Notes (visible to customer)</Label>
          <Textarea rows={3} value={v.notes} onChange={(e) => setField("notes", e.target.value)} />
        </div>
        <div>
          <Label>Terms &amp; conditions</Label>
          <Textarea rows={3} value={v.terms} onChange={(e) => setField("terms", e.target.value)} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={() => router.push("/sales/invoices")} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
