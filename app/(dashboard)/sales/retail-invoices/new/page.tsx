import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { currencySymbol } from "@/lib/money";
import { createRetailInvoiceAction } from "../actions";

export const metadata = { title: "New Retail Invoice" };

export default async function NewRetailInvoicePage() {
  const { organization } = await requireOrganization();
  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/sales/retail-invoices"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Retail Invoice</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form action={createRetailInvoiceAction} className="space-y-4">
            <div><Label>Customer name <span className="text-destructive">*</span></Label><Input name="customerName" required maxLength={120} placeholder="Walk-in customer or short name" /></div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Date</Label><Input type="date" name="date" defaultValue={format(new Date(), "yyyy-MM-dd")} required /></div>
              <div>
                <Label>Total</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol(organization.currency)}</span>
                  <Input type="number" step="0.01" min="0.01" name="total" className="pl-8" required />
                </div>
              </div>
            </div>
            <div><Label>Description / item</Label><Textarea name="description" rows={2} placeholder="What was sold?" /></div>
            <p className="text-xs text-muted-foreground">Retail invoices are marked PAID immediately and tagged as cash-basis. They appear on /sales/invoices alongside regular invoices.</p>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" asChild><Link href="/sales/retail-invoices">Cancel</Link></Button>
              <Button type="submit">Record sale</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
