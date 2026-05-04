import Link from "next/link";
import { startOfWeek, endOfWeek, addDays, format, parseISO } from "date-fns";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Weekly Log" };

export default async function WeeklyLogPage({ searchParams }: { searchParams: Record<string, string> }) {
  const { organization, user } = await requireOrganization();

  const baseDate = searchParams.week ? parseISO(searchParams.week) : new Date();
  const weekStart = startOfWeek(baseDate, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(baseDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  const entries = await db.timeEntry.findMany({
    where: { organizationId: organization.id, userId: user.id, date: { gte: weekStart, lte: weekEnd } },
    include: { project: { select: { name: true, id: true } } },
    orderBy: { date: "asc" },
  });

  const byProject = new Map<string, { name: string; hours: number[]; total: number }>();
  for (const e of entries) {
    if (!byProject.has(e.projectId)) byProject.set(e.projectId, { name: e.project.name, hours: Array(7).fill(0), total: 0 });
    const row = byProject.get(e.projectId)!;
    const dayIdx = days.findIndex((d) => format(d, "yyyy-MM-dd") === format(e.date, "yyyy-MM-dd"));
    if (dayIdx >= 0) {
      row.hours[dayIdx] += Number(e.hours);
      row.total += Number(e.hours);
    }
  }
  const dayTotals = days.map((_, i) =>
    Array.from(byProject.values()).reduce((s, r) => s + r.hours[i], 0)
  );
  const grandTotal = dayTotals.reduce((s, n) => s + n, 0);

  const prevWeek = format(addDays(weekStart, -7), "yyyy-MM-dd");
  const nextWeek = format(addDays(weekStart, 7), "yyyy-MM-dd");

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Weekly Log</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm"><Link href={`/time/weekly-log?week=${prevWeek}`}><ArrowLeft className="h-3.5 w-3.5 mr-1" /> Prev</Link></Button>
          <span className="text-sm text-muted-foreground">{format(weekStart, "dd MMM")} – {format(weekEnd, "dd MMM yyyy")}</span>
          <Button asChild variant="outline" size="sm"><Link href={`/time/weekly-log?week=${nextWeek}`}>Next <ArrowRight className="h-3.5 w-3.5 ml-1" /></Link></Button>
          <Button asChild size="sm"><Link href="/time/entries/new">+ Log time</Link></Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {byProject.size === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              <p>No time logged this week.</p>
              <Button asChild size="sm" className="mt-3"><Link href="/time/entries/new">+ Log time</Link></Button>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Project</th>
                  {days.map((d) => (
                    <th key={format(d, "yyyy-MM-dd")} className="text-center p-3">
                      <div>{format(d, "EEE")}</div>
                      <div className="text-[10px]">{format(d, "dd")}</div>
                    </th>
                  ))}
                  <th className="text-right p-3">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Array.from(byProject.values()).map((r) => (
                  <tr key={r.name}>
                    <td className="p-3 font-medium">{r.name}</td>
                    {r.hours.map((h, i) => (
                      <td key={i} className="p-3 text-center tabular-nums">{h > 0 ? h.toFixed(1) : "—"}</td>
                    ))}
                    <td className="p-3 text-right tabular-nums font-semibold">{r.total.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/20 text-sm">
                <tr>
                  <td className="p-3 font-medium">Daily total</td>
                  {dayTotals.map((t, i) => (
                    <td key={i} className="p-3 text-center tabular-nums font-semibold">{t > 0 ? t.toFixed(1) : "—"}</td>
                  ))}
                  <td className="p-3 text-right tabular-nums font-semibold">{grandTotal.toFixed(1)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
