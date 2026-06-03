import Link from "next/link";
import { DirtyFormProvider, DirtyLink } from "@/components/shared/dirty-form-nav";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { currencySymbol } from "@/lib/money";
import { createTaskAction } from "../actions";

export const metadata = { title: "New Task" };

export default async function NewTaskPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const project = await db.project.findFirst({ where: { id: params.id, organizationId: organization.id } });
  if (!project) notFound();
  return (
    <DirtyFormProvider>
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon"><DirtyLink href={`/time/projects/${project.id}`}><ArrowLeft className="h-4 w-4" /></DirtyLink></Button>
        <h1 className="text-xl font-semibold">New Task — {project.name}</h1>
      </div>
      <Card>
        <CardContent className="pt-6">
          <form action={createTaskAction} className="space-y-4">
            <input type="hidden" name="projectId" value={project.id} />
            <div><Label>Name <span className="text-destructive">*</span></Label><Input name="name" required maxLength={120} /></div>
            <div><Label>Description</Label><Textarea name="description" rows={3} /></div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Status</Label>
                <select name="status" defaultValue="todo" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option>
                </select>
              </div>
              <div>
                <Label>Hourly rate</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{currencySymbol(organization.currency)}</span>
                  <Input type="number" step="0.01" min="0" name="hourlyRate" className="pl-8" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" asChild><Link href={`/time/projects/${project.id}`}>Cancel</Link></Button>
              <Button type="submit">Add task</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
    </DirtyFormProvider>
  );
}
