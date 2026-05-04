// shared bank-transaction-style form (client wrapper of the server action prop)
"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export function QuickBankForm({
  title, accounts, action, cancelHref, descriptionLabel = "Description",
}: {
  title: string;
  accounts: { id: string; name: string }[];
  action: (formData: FormData) => Promise<void>;
  cancelHref: string;
  descriptionLabel?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await action(new FormData(e.currentTarget)); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); setBusy(false); }
  }

  if (accounts.length === 0) {
    return (
      <Card><CardContent className="py-8 text-center text-sm text-muted-foreground space-y-2">
        <p>You need at least one bank account first.</p>
        <Button asChild><Link href="/banking/accounts/new">+ Add bank account</Link></Button>
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold mb-4">{title}</h2>
        <form onSubmit={handle} className="space-y-4">
          <div>
            <Label>Bank account <span className="text-destructive">*</span></Label>
            <select name="bankAccountId" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Date</Label><Input type="date" name="date" defaultValue={format(new Date(), "yyyy-MM-dd")} required /></div>
            <div><Label>Amount</Label><Input type="number" step="0.01" min="0.01" name="amount" required /></div>
          </div>
          <div><Label>{descriptionLabel}</Label><Input name="description" maxLength={500} /></div>
          <div><Label>Reference</Label><Input name="reference" maxLength={120} placeholder="Optional" /></div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => router.push(cancelHref)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
