import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { WorkflowRulesManager } from "./manager";

export const metadata = { title: "Workflow Rules" };

export default async function WorkflowRulesPage() {
  const { organization } = await requireOrganization();
  const rows = await db.workflowRule.findMany({ where: { organizationId: organization.id }, orderBy: { name: "asc" } });
  return (
    <SettingsShell title="Workflow Rules" description="Trigger actions when records change.">
      <Card><CardContent className="pt-6">
        <WorkflowRulesManager initial={rows.map((r) => ({ id: r.id, name: r.name, module: r.module, trigger: r.trigger, isActive: r.isActive }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
