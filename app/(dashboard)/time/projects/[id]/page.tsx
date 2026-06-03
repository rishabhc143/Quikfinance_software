import Link from "next/link";
import { BackLink } from "@/components/shared/dirty-form-nav";
import { notFound } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteButton } from "@/components/shared/delete-button";
import { deleteProjectAction } from "../actions";
import { deleteTaskAction } from "./tasks/actions";
import { formatMoney } from "@/lib/money";

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const { organization } = await requireOrganization();
  const project = await db.project.findFirst({
    where: { id: params.id, organizationId: organization.id },
    include: { tasks: { orderBy: { name: "asc" } }, timeEntries: { orderBy: { date: "desc" }, take: 5 } },
  });
  if (!project) notFound();

  const totalHours = await db.timeEntry.aggregate({ where: { projectId: project.id }, _sum: { hours: true } });
  const cur = organization.currency;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon"><BackLink href="/time/projects"><ArrowLeft className="h-4 w-4" /></BackLink></Button>
          <h1 className="text-xl font-semibold truncate">{project.name}</h1>
          <Badge variant={project.status === "active" ? "success" : "outline"}>{project.status.replace("_", " ")}</Badge>
        </div>
        <DeleteButton action={deleteProjectAction.bind(null, project.id)} confirmText="Delete this project? Tasks and time entries are kept but unlinked." redirectTo="/time/projects" />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Budget</div><div className="text-xl font-semibold mt-1">{project.budget ? formatMoney(Number(project.budget), cur) : "—"}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Hours logged</div><div className="text-xl font-semibold mt-1">{Number(totalHours._sum.hours ?? 0).toFixed(1)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Tasks</div><div className="text-xl font-semibold mt-1">{project.tasks.length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Tasks</CardTitle>
          <Button asChild size="sm"><Link href={`/time/projects/${project.id}/tasks/new`}><Plus className="h-3.5 w-3.5 mr-1" /> Add task</Link></Button>
        </CardHeader>
        <CardContent className="p-0">
          {project.tasks.length === 0 ? (
            <div className="p-6 text-sm text-center text-muted-foreground">No tasks yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Status</th><th className="text-right p-3">Rate</th><th /></tr>
              </thead>
              <tbody className="divide-y">
                {project.tasks.map((t) => (
                  <tr key={t.id}>
                    <td className="p-3 font-medium">{t.name}</td>
                    <td className="p-3"><Badge variant="outline">{t.status}</Badge></td>
                    <td className="p-3 text-right tabular-nums">{t.hourlyRate ? formatMoney(Number(t.hourlyRate), cur) + "/hr" : "—"}</td>
                    <td className="p-3 text-right">
                      <DeleteButton action={deleteTaskAction.bind(null, t.id)} variant="ghost" label="" confirmText="Delete this task?" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {project.timeEntries.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recent time entries</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="text-left p-3">Date</th><th className="text-left p-3">Description</th><th className="text-right p-3">Hours</th></tr>
              </thead>
              <tbody className="divide-y">
                {project.timeEntries.map((e) => (
                  <tr key={e.id}>
                    <td className="p-3">{format(e.date, "dd MMM yyyy")}</td>
                    <td className="p-3 text-muted-foreground">{e.description ?? "—"}</td>
                    <td className="p-3 text-right tabular-nums">{Number(e.hours).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
