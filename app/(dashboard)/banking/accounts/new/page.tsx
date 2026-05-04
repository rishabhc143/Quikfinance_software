import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createBankAccountAction } from "../actions";

export const metadata = { title: "New Bank Account" };

export default async function NewBankAccountPage() {
  const { organization } = await requireOrganization();
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/banking"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Bank Account</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form action={createBankAccountAction} className="space-y-4">
            <div><Label>Name <span className="text-destructive">*</span></Label><Input name="name" required maxLength={120} /></div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Account number</Label><Input name="accountNumber" maxLength={40} /></div>
              <div>
                <Label>Type</Label>
                <select name="accountType" defaultValue="checking" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="checking">Checking</option>
                  <option value="savings">Savings</option>
                  <option value="credit_card">Credit card</option>
                  <option value="cash">Cash</option>
                  <option value="wallet">Wallet</option>
                </select>
              </div>
              <div><Label>Currency</Label><Input name="currency" defaultValue={organization.currency} maxLength={8} /></div>
              <div><Label>Opening balance</Label><Input name="openingBalance" type="number" step="0.01" defaultValue="0" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" asChild><Link href="/banking">Cancel</Link></Button>
              <Button type="submit">Create account</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
