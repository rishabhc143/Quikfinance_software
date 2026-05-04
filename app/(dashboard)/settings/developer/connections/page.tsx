import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsShell } from "@/components/shared/settings-shell";

export const metadata = { title: "Connections" };

export default async function ConnectionsPage() {
  const { organization } = await requireOrganization();
  const integrations = await db.integration.findMany({ where: { organizationId: organization.id }, orderBy: { kind: "asc" } });
  return (
    <SettingsShell title="Connections" description="External providers connected to this organization.">
      <Card>
        <CardContent className="p-0">
          {integrations.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No connections yet. Connect providers from /settings/integrations.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">Provider</th><th className="text-left p-3">Status</th><th className="text-left p-3">Connected</th></tr></thead>
              <tbody className="divide-y">
                {integrations.map((i) => (
                  <tr key={i.id}>
                    <td className="p-3 font-medium capitalize">{i.kind.replace("-", " ")}</td>
                    <td className="p-3"><Badge variant={i.isConnected ? "success" : "secondary"}>{i.isConnected ? "Connected" : "Not connected"}</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground">{i.connectedAt ? format(i.connectedAt, "dd MMM yyyy HH:mm") : "—"}</td>
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
