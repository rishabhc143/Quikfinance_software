import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { RemindersManager } from "./manager";

export const metadata = { title: "Reminders" };

export default async function RemindersPage() {
  const { organization } = await requireOrganization();
  const rows = await db.reminder.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  return (
    <SettingsShell title="Reminders" description="Automated reminders for unpaid invoices and overdue bills.">
      <Card><CardContent className="pt-6">
        <RemindersManager initial={rows.map((r) => ({ id: r.id, name: r.name, appliesTo: r.appliesTo, daysBefore: r.daysBefore, daysAfter: r.daysAfter, isActive: r.isActive, template: r.template ?? "" }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
