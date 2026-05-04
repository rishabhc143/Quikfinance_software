import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { currencySymbol } from "@/lib/money";
import { createRecurringInvoiceAction } from "../actions";

export const metadata = { title: "New Recurring Invoice" };

export default async function NewRecurringInvoicePage() {
  const { organization } = await requireOrganization();
  const customers = await db.contact.findMany({
    where: { organizationId: organization.id, deletedAt: null, type: { in: ["CUSTOMER", "BOTH"] } },
    select: { id: true, displayName: true }, orderBy: { displayName: "asc" },
  });
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/sales/recurring-invoices"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Recurring Invoice</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          {customers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add a customer first. <Link href="/contacts/new" className="underline">Create one</Link>.</p>
          ) : (
            <form action={createRecurringInvoiceAction} className="space-y-4">
              <div><Label>Profile name <span className="text-destructive">*</span></Label><Input name="profileName" required maxLength={120} placeholder="Monthly retainer — Acme" /></div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Customer <span className="text-destructive">*</span></Label>
                  <select name="contactId" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
                  </select>
                </div>
                <div>
                  <Label>Frequency</Label>
                  <select name="frequency" defaultValue="monthly" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option><option value="yearly">Yearly</option>
                  </select>
                </div>
                <div><Label>Next run</Label><Input type="date" name="nextRunAt" defaultValue={format(new Date(), "yyyy-MM-dd")} required /></div>
                <div>
                  <Label>Amount</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol(organization.currency)}</span>
                    <Input type="number" step="0.01" min="0" name="amount" defaultValue="0" className="pl-8" />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" asChild><Link href="/sales/recurring-invoices">Cancel</Link></Button>
                <Button type="submit">Create profile</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
