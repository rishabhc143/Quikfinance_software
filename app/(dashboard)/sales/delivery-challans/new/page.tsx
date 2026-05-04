import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createDeliveryChallanAction } from "../actions";

export const metadata = { title: "New Delivery Challan" };

export default async function NewDeliveryChallanPage() {
  const { organization } = await requireOrganization();
  const customers = await db.contact.findMany({
    where: { organizationId: organization.id, deletedAt: null, type: { in: ["CUSTOMER", "BOTH"] } },
    select: { id: true, displayName: true }, orderBy: { displayName: "asc" },
  });
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/sales/delivery-challans"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Delivery Challan</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form action={createDeliveryChallanAction} className="space-y-4">
            <div>
              <Label>Customer</Label>
              <select name="contactId" defaultValue="" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">— None —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>Date <span className="text-destructive">*</span></Label><Input type="date" name="date" defaultValue={format(new Date(), "yyyy-MM-dd")} required /></div>
              <div>
                <Label>Status</Label>
                <select name="status" defaultValue="draft" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option>draft</option><option>dispatched</option><option>delivered</option><option>cancelled</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" asChild><Link href="/sales/delivery-challans">Cancel</Link></Button>
              <Button type="submit">Create challan</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
