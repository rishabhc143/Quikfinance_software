import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { WorkflowActionsManager } from "./manager";

export const metadata = { title: "Workflow Actions" };

export default async function WorkflowActionsPage() {
  const { organization } = await requireOrganization();
  const rows = await db.workflowAction.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  return (
    <SettingsShell title="Workflow Actions" description="Reusable actions called by workflow rules.">
      <Card><CardContent className="pt-6">
        <WorkflowActionsManager initial={rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, isActive: r.isActive }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
