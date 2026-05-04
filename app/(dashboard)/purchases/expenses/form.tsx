"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { currencySymbol } from "@/lib/money";
import { toast } from "sonner";

type Initial = { date: string; category?: string; amount?: string; contactId?: string | null; reference?: string; notes?: string };

const CATEGORIES = ["Office Supplies", "Travel", "Meals & Entertainment", "Software & Subscriptions", "Utilities", "Rent", "Marketing", "Professional Fees", "Other"];

export function ExpenseForm({
  action, initial, vendorOptions, currency, submitLabel = "Save",
}: {
  action: (formData: FormData) => Promise<void>;
  initial: Initial;
  vendorOptions: ComboboxOption[];
  currency: string;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [contactId, setContactId] = React.useState<string | null>(initial.contactId ?? null);
  const [busy, setBusy] = React.useState(false);

  async function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    if (contactId) fd.set("contactId", contactId);
    else fd.set("contactId", "");
    try { await action(fd); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); setBusy(false); }
  }

  return (
    <form onSubmit={handle} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div><Label>Date <span className="text-destructive">*</span></Label><Input name="date" type="date" defaultValue={initial.date} required /></div>
        <div>
          <Label>Category <span className="text-destructive">*</span></Label>
          <input name="category" defaultValue={initial.category ?? "Office Supplies"} list="exp-cat" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required />
          <datalist id="exp-cat">
            {CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <Label>Amount <span className="text-destructive">*</span></Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol(currency)}</span>
            <Input name="amount" type="number" step="0.01" min="0.01" defaultValue={initial.amount} className="pl-8" required />
          </div>
        </div>
        <div>
          <Label>Vendor</Label>
          <Combobox options={vendorOptions} value={contactId} onChange={setContactId} placeholder="Optional" />
        </div>
        <div className="md:col-span-2"><Label>Reference</Label><Input name="reference" defaultValue={initial.reference ?? ""} placeholder="Receipt #, PO, etc." /></div>
        <div className="md:col-span-2"><Label>Notes</Label><Textarea name="notes" rows={2} defaultValue={initial.notes ?? ""} /></div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={() => router.push("/purchases/expenses")} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{submitLabel}</Button>
      </div>
    </form>
  );
}
