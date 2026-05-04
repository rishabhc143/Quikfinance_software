import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { ReportingTagsManager } from "./manager";

export const metadata = { title: "Reporting Tags" };

export default async function ReportingTagsPage() {
  const { organization } = await requireOrganization();
  const rows = await db.reportingTag.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  return (
    <SettingsShell title="Reporting Tags" description="Tags used to slice reports across departments, projects, and regions.">
      <Card><CardContent className="pt-6">
        <ReportingTagsManager initial={rows.map((t) => ({ id: t.id, name: t.name, color: t.color }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
