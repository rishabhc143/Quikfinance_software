import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createBankTransferAction } from "../actions";

export const metadata = { title: "New Bank Transfer" };

export default async function NewBankTransferPage() {
  const { organization } = await requireOrganization();
  const accounts = await db.bankAccount.findMany({
    where: { organizationId: organization.id, isActive: true },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/banking/transfers"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Bank Transfer</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          {accounts.length < 2 ? (
            <p className="text-sm text-muted-foreground">You need at least 2 bank accounts to make a transfer. <Link href="/banking/accounts/new" className="underline">Add another account</Link>.</p>
          ) : (
            <form action={createBankTransferAction} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>From <span className="text-destructive">*</span></Label>
                  <select name="fromAccountId" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label>To <span className="text-destructive">*</span></Label>
                  <select name="toAccountId" required defaultValue={accounts[1]?.id} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div><Label>Date</Label><Input type="date" name="date" defaultValue={format(new Date(), "yyyy-MM-dd")} required /></div>
                <div><Label>Amount</Label><Input type="number" step="0.01" min="0.01" name="amount" required /></div>
                <div className="md:col-span-2"><Label>Reference</Label><Input name="reference" placeholder="Optional note" /></div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" asChild><Link href="/banking/transfers">Cancel</Link></Button>
                <Button type="submit">Transfer</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
