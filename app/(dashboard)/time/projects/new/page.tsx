import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { currencySymbol } from "@/lib/money";
import { createProjectAction } from "../actions";

export const metadata = { title: "New Project" };

export default async function NewProjectPage() {
  const { organization } = await requireOrganization();
  const customers = await db.contact.findMany({
    where: { organizationId: organization.id, deletedAt: null, type: { in: ["CUSTOMER", "BOTH"] } },
    select: { id: true, displayName: true }, orderBy: { displayName: "asc" },
  });
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><Link href="/time/projects"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-xl font-semibold">New Project</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form action={createProjectAction} className="space-y-4">
            <div><Label>Name <span className="text-destructive">*</span></Label><Input name="name" required maxLength={120} /></div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Customer</Label>
                <select name="customerId" defaultValue="" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Internal (no customer)</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
                </select>
              </div>
              <div>
                <Label>Status</Label>
                <select name="status" defaultValue="active" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="active">Active</option><option value="on_hold">On hold</option>
                  <option value="completed">Completed</option><option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <Label>Budget</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol(organization.currency)}</span>
                  <Input name="budget" type="number" step="0.01" min="0" className="pl-8" />
                </div>
              </div>
              <div /><div><Label>Start date</Label><Input name="startDate" type="date" /></div>
              <div><Label>End date</Label><Input name="endDate" type="date" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" asChild><Link href="/time/projects">Cancel</Link></Button>
              <Button type="submit">Create project</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
