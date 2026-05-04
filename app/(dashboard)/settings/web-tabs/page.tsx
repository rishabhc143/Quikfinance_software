import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { WebTabsManager } from "./manager";

export const metadata = { title: "Web Tabs" };

export default async function WebTabsPage() {
  const { organization } = await requireOrganization();
  const rows = await db.webTab.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  return (
    <SettingsShell title="Web Tabs" description="Embed external tools as tabs inside Quikfinance.">
      <Card><CardContent className="pt-6">
        <WebTabsManager initial={rows.map((w) => ({ id: w.id, name: w.name, url: w.url }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
