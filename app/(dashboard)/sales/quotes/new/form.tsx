"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { currencySymbol } from "@/lib/money";
import { createQuoteAction } from "../actions";
import { toast } from "sonner";

export function QuoteForm({ contactOptions, currency }: { contactOptions: ComboboxOption[]; currency: string }) {
  const router = useRouter();
  const today = format(new Date(), "yyyy-MM-dd");
  const expiry = format(new Date(Date.now() + 14 * 86400000), "yyyy-MM-dd");
  const [contactId, setContactId] = React.useState<string | null>(null);
  const [issueDate, setIssueDate] = React.useState(today);
  const [expiryDate, setExpiryDate] = React.useState(expiry);
  const [total, setTotal] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!contactId) { toast.error("Pick a customer"); return; }
    setBusy(true);
    try {
      await createQuoteAction({ contactId, status: "DRAFT", issueDate: new Date(issueDate), expiryDate: expiryDate ? new Date(expiryDate) : null, total });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label>Customer <span className="text-destructive">*</span></Label>
        <Combobox options={contactOptions} value={contactId} onChange={setContactId} placeholder="Select customer" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Issue date</Label><Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required /></div>
        <div><Label>Expiry date</Label><Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></div>
      </div>
      <div>
        <Label>Total amount</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol(currency)}</span>
          <Input type="number" step="0.01" min="0" value={total} onChange={(e) => setTotal(Number(e.target.value))} className="pl-8" required />
        </div>
        <p className="text-xs text-muted-foreground mt-1">Line items on quotes arrive in a future release; for now the quote stores a single total.</p>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={() => router.push("/sales/quotes")}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create quote</Button>
      </div>
    </form>
  );
}
