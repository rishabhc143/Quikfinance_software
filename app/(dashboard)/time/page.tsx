import Link from "next/link";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, FolderKanban, Clock, Calendar } from "lucide-react";

export const metadata = { title: "Time Tracking" };

const TILES = [
  { href: "/time/projects", label: "Projects", icon: FolderKanban, complete: true },
  { href: "/time/entries", label: "Time Entries", icon: Clock, complete: true },
  { href: "/time/weekly-log", label: "Weekly Log", icon: Calendar, complete: true },
];

export default async function TimePage() {
  const { organization } = await requireOrganization();
  const [projectCount, entryCount, hoursSum] = await Promise.all([
    db.project.count({ where: { organizationId: organization.id } }),
    db.timeEntry.count({ where: { organizationId: organization.id } }),
    db.timeEntry.aggregate({ where: { organizationId: organization.id }, _sum: { hours: true } }),
  ]);
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Time Tracking</h1>
        <p className="text-sm text-muted-foreground">Projects, tasks, and billable hours.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Projects</div><div className="text-2xl font-semibold mt-1">{projectCount}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Time entries</div><div className="text-2xl font-semibold mt-1">{entryCount}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Hours logged</div><div className="text-2xl font-semibold mt-1">{Number(hoursSum._sum.hours ?? 0).toFixed(1)}</div></CardContent></Card>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {TILES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href}>
              <Card className="hover:bg-muted/30 transition-colors h-full">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {t.label}
                    {!t.complete && <Badge variant="outline" className="ml-auto text-[10px]">Soon</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground flex items-center justify-between">Open <ArrowRight className="h-3 w-3" /></CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
