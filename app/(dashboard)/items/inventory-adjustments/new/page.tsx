import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { createInventoryAdjustmentAction } from "../actions";

export const metadata = { title: "New Inventory Adjustment" };

const REASONS = ["Stock count correction", "Damage / breakage", "Internal use", "Sample / promotion", "Theft / loss", "Other"];

export default async function NewInventoryAdjustmentPage() {
  const { organization } = await requireOrganization();
  const items = await db.item.findMany({
    where: { organizationId: organization.id, deletedAt: null, isActive: true, type: "GOODS" },
    orderBy: { name: "asc" }, select: { id: true, name: true, unit: true },
  });
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/items/inventory-adjustments"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Inventory Adjustment</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No goods-type items yet. <Link href="/items/new" className="underline">Create an item</Link> first.</p>
          ) : (
            <form action={createInventoryAdjustmentAction} className="space-y-4">
              <div>
                <Label>Item <span className="text-destructive">*</span></Label>
                <select name="itemId" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {items.map((i) => <option key={i.id} value={i.id}>{i.name}{i.unit ? ` (${i.unit})` : ""}</option>)}
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div><Label>Date <span className="text-destructive">*</span></Label><Input type="date" name="date" defaultValue={format(new Date(), "yyyy-MM-dd")} required /></div>
                <div>
                  <Label>Direction <span className="text-destructive">*</span></Label>
                  <select name="direction" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="increase">Increase (+)</option>
                    <option value="decrease">Decrease (−)</option>
                  </select>
                </div>
                <div>
                  <Label>Quantity <span className="text-destructive">*</span></Label>
                  <Input type="number" step="0.01" min="0.01" name="quantity" required />
                </div>
                <div>
                  <Label>Reason <span className="text-destructive">*</span></Label>
                  <input
                    name="reason"
                    list="adjustment-reasons"
                    required
                    maxLength={120}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    defaultValue={REASONS[0]}
                  />
                  <datalist id="adjustment-reasons">
                    {REASONS.map((r) => <option key={r} value={r} />)}
                  </datalist>
                </div>
              </div>
              <div><Label>Notes</Label><Textarea name="notes" rows={2} maxLength={2000} /></div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" asChild><Link href="/items/inventory-adjustments">Cancel</Link></Button>
                <Button type="submit">Record adjustment</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
