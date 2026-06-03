import Link from "next/link";
import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { format } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { createTimeEntryAction } from "../actions";

export const metadata = { title: "Log Time" };

export default async function NewTimeEntryPage() {
  const { organization } = await requireOrganization();
  const projects = await db.project.findMany({
    where: { organizationId: organization.id, status: "active" },
    orderBy: { name: "asc" }, select: { id: true, name: true },
  });
  return (
    <DirtyFormProvider>
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><DirtyLink href="/time/entries"><ArrowLeft className="h-4 w-4" /></DirtyLink></Button>
        <h1 className="text-xl font-semibold">Log Time</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          {projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Create a project first. <Link href="/time/projects/new" className="underline">Create one</Link>.</p>
          ) : (
            <form action={createTimeEntryAction} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Project <span className="text-destructive">*</span></Label>
                  <select name="projectId" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div><Label>Date <span className="text-destructive">*</span></Label><Input name="date" type="date" defaultValue={format(new Date(), "yyyy-MM-dd")} required /></div>
                <div><Label>Hours <span className="text-destructive">*</span></Label><Input name="hours" type="number" step="0.25" min="0.25" max="24" defaultValue="1" required /></div>
                <div /><div className="md:col-span-2"><Label>Description</Label><Textarea name="description" rows={2} placeholder="What did you work on?" /></div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" asChild><Link href="/time/entries">Cancel</Link></Button>
                <Button type="submit">Log time</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
    </DirtyFormProvider>
  );
}
