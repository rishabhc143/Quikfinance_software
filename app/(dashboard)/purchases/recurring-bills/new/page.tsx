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
import { createRecurringBillAction } from "../actions";

export const metadata = { title: "New Recurring Bill" };

export default async function NewRecurringBillPage() {
  const { organization } = await requireOrganization();
  const vendors = await db.contact.findMany({
    where: { organizationId: organization.id, deletedAt: null, type: { in: ["VENDOR", "BOTH"] } },
    select: { id: true, displayName: true }, orderBy: { displayName: "asc" },
  });
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/purchases/recurring-bills"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Recurring Bill</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form action={createRecurringBillAction} className="space-y-4">
            <div><Label>Profile name <span className="text-destructive">*</span></Label><Input name="profileName" required maxLength={120} placeholder="Office rent, Linear subscription, etc." /></div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Vendor</Label>
                <select name="contactId" defaultValue="" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">— None —</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.displayName}</option>)}
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
              <Button type="button" variant="outline" asChild><Link href="/purchases/recurring-bills">Cancel</Link></Button>
              <Button type="submit">Create profile</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
