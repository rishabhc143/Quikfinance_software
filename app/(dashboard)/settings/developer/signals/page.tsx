import { format } from "date-fns";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SettingsShell } from "@/components/shared/settings-shell";

export const metadata = { title: "Signals" };

export default async function SignalsPage() {
  const { organization } = await requireOrganization();
  // Recent destructive operations as "signals"
  const signals = await db.auditLog.findMany({
    where: { organizationId: organization.id, action: { in: ["DELETE", "UPDATE"] } },
    orderBy: { createdAt: "desc" }, take: 20,
  });
  return (
    <SettingsShell title="Signals" description="Recent significant changes across this organization. Useful for catching unintended mutations.">
      <Card>
        <CardContent className="p-0">
          {signals.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No significant activity yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">When</th><th className="text-left p-3">Action</th><th className="text-left p-3">Entity</th><th className="text-left p-3">ID</th></tr></thead>
              <tbody className="divide-y">
                {signals.map((s) => (
                  <tr key={s.id}>
                    <td className="p-3 text-xs text-muted-foreground">{format(s.createdAt, "dd MMM HH:mm")}</td>
                    <td className="p-3"><Badge variant={s.action === "DELETE" ? "destructive" : "outline"}>{s.action}</Badge></td>
                    <td className="p-3">{s.entityType}</td>
                    <td className="p-3 font-mono text-xs text-muted-foreground">{s.entityId.slice(0, 16)}…</td>
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
