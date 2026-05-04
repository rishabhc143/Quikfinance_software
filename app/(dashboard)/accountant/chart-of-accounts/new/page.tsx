import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { createAccountAction } from "../actions";

export const metadata = { title: "New Account" };

export default function NewAccountPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/accountant/chart-of-accounts"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Account</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form action={createAccountAction} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Code</Label><Input name="code" maxLength={20} placeholder="6300" /></div>
              <div>
                <Label>Type <span className="text-destructive">*</span></Label>
                <select name="type" defaultValue="EXPENSE" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                  <option value="ASSET">Asset</option>
                  <option value="LIABILITY">Liability</option>
                  <option value="EQUITY">Equity</option>
                  <option value="INCOME">Income</option>
                  <option value="EXPENSE">Expense</option>
                  <option value="COST_OF_GOODS_SOLD">Cost of Goods Sold</option>
                  <option value="OTHER_INCOME">Other Income</option>
                  <option value="OTHER_EXPENSE">Other Expense</option>
                </select>
              </div>
              <div className="md:col-span-2"><Label>Name <span className="text-destructive">*</span></Label><Input name="name" required maxLength={120} /></div>
              <div className="md:col-span-2"><Label>Description</Label><Textarea name="description" rows={2} maxLength={500} /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" asChild><Link href="/accountant/chart-of-accounts">Cancel</Link></Button>
              <Button type="submit">Create account</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
