import Link from "next/link";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createTransactionAction } from "../actions";

export const metadata = { title: "New Bank Transaction" };

export default async function NewTransactionPage() {
  const { organization } = await requireOrganization();
  const accounts = await db.bankAccount.findMany({
    where: { organizationId: organization.id, isActive: true },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/banking/transactions"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Bank Transaction</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">Add a bank account first. <Link href="/banking/accounts/new" className="underline">Create one</Link>.</p>
          ) : (
            <form action={createTransactionAction} className="space-y-4">
              <div>
                <Label>Bank account <span className="text-destructive">*</span></Label>
                <select name="bankAccountId" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div><Label>Date <span className="text-destructive">*</span></Label><Input name="date" type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} required /></div>
                <div>
                  <Label>Type <span className="text-destructive">*</span></Label>
                  <select name="type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                    <option value="credit">Credit (money in)</option>
                    <option value="debit">Debit (money out)</option>
                  </select>
                </div>
                <div className="md:col-span-2"><Label>Description <span className="text-destructive">*</span></Label><Input name="description" required maxLength={500} /></div>
                <div><Label>Reference</Label><Input name="reference" maxLength={120} /></div>
                <div><Label>Amount <span className="text-destructive">*</span></Label><Input name="amount" type="number" step="0.01" min="0.01" required /></div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" asChild><Link href="/banking/transactions">Cancel</Link></Button>
                <Button type="submit">Record</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
