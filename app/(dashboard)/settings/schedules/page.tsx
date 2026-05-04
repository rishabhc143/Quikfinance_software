import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { SchedulesManager } from "./manager";

export const metadata = { title: "Schedules" };

export default async function SchedulesPage() {
  const { organization } = await requireOrganization();
  const rows = await db.schedule.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  return (
    <SettingsShell title="Schedules" description="Recurring jobs (book close, reminders dispatch, recurring invoices runner).">
      <Card><CardContent className="pt-6">
        <SchedulesManager initial={rows.map((s) => ({ id: s.id, name: s.name, cron: s.cron, taskKind: s.taskKind, isActive: s.isActive, lastRunAt: s.lastRunAt?.toISOString() ?? null }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
