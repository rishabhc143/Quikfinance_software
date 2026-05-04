import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";

export const metadata = { title: "Workflow Logs" };

export default async function WorkflowLogsPage() {
  const { organization } = await requireOrganization();
  const logs = await db.workflowLog.findMany({
    where: { organizationId: organization.id },
    orderBy: { createdAt: "desc" }, take: 100,
  });
  return (
    <SettingsShell title="Workflow Logs" description="Run history for every workflow execution. Last 100 entries.">
      <Card>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No workflow runs yet. Logs appear once the runner starts firing rules.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">When</th><th className="text-left p-3">Rule</th><th className="text-left p-3">Status</th><th className="text-left p-3">Message</th></tr></thead>
              <tbody className="divide-y">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="p-3 text-xs text-muted-foreground">{format(l.createdAt, "dd MMM yyyy HH:mm")}</td>
                    <td className="p-3 font-medium">{l.ruleName}</td>
                    <td className="p-3"><Badge variant={l.status === "success" ? "success" : l.status === "failed" ? "destructive" : "outline"}>{l.status}</Badge></td>
                    <td className="p-3 text-muted-foreground">{l.message ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
