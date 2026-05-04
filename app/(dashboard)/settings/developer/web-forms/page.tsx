import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { WebFormsManager } from "./manager";

export const metadata = { title: "Web Forms" };

export default async function WebFormsPage() {
  const { organization } = await requireOrganization();
  const rows = await db.webForm.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  return (
    <SettingsShell title="Web Forms" description="Embed lead-capture and contact-creation forms on your website.">
      <Card><CardContent className="pt-6">
        <WebFormsManager initial={rows.map((w) => ({ id: w.id, name: w.name, slug: w.slug, isActive: w.isActive, submissionsCount: w.submissionsCount }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
