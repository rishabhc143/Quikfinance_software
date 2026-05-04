"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { currencySymbol } from "@/lib/money";
import { toast } from "sonner";

export type SimpleDocValues = {
  contactId: string | null;
  date: string;
  expiry: string;
  total: number;
  status: string;
};

export function SimpleDocForm({
  contactLabel = "Customer",
  statusOptions,
  contactOptions,
  currency,
  defaultDate,
  hasExpiry = false,
  onSubmitAction,
  cancelHref,
  submitLabel = "Create",
}: {
  contactLabel?: string;
  statusOptions: string[];
  contactOptions: ComboboxOption[];
  currency: string;
  defaultDate: string;
  hasExpiry?: boolean;
  onSubmitAction: (values: SimpleDocValues) => Promise<unknown>;
  cancelHref: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [contactId, setContactId] = React.useState<string | null>(null);
  const [date, setDate] = React.useState(defaultDate);
  const [expiry, setExpiry] = React.useState("");
  const [total, setTotal] = React.useState(0);
  const [status, setStatus] = React.useState(statusOptions[0]);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!contactId) { toast.error(`Pick a ${contactLabel.toLowerCase()}`); return; }
    setBusy(true);
    try { await onSubmitAction({ contactId, date, expiry, total, status }); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label>{contactLabel} <span className="text-destructive">*</span></Label>
        <Combobox options={contactOptions} value={contactId} onChange={setContactId} placeholder={`Select ${contactLabel.toLowerCase()}`} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
        {hasExpiry && <div><Label>Expiry</Label><Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></div>}
        <div>
          <Label>Status</Label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div>
        <Label>Total amount</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol(currency)}</span>
          <Input type="number" step="0.01" min="0" value={total} onChange={(e) => setTotal(Number(e.target.value))} className="pl-8" required />
        </div>
        <p className="text-xs text-muted-foreground mt-1">Line items will land in a future release; for now the document stores a single total.</p>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={() => router.push(cancelHref)} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{submitLabel}</Button>
      </div>
    </form>
  );
}
