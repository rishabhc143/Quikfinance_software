import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { format, subDays } from "date-fns";

export const metadata = { title: "API Usage" };

export default async function ApiUsagePage() {
  const { organization } = await requireOrganization();
  const since = subDays(new Date(), 7);
  const [count, recent] = await Promise.all([
    db.apiUsageLog.count({ where: { organizationId: organization.id, createdAt: { gte: since } } }),
    db.apiUsageLog.findMany({ where: { organizationId: organization.id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return (
    <SettingsShell title="API Usage" description="Requests made via your API keys in the last 7 days.">
      <Card><CardContent className="pt-6"><div className="text-3xl font-semibold tabular-nums">{count.toLocaleString()}</div><div className="text-xs text-muted-foreground mt-1">requests last 7 days</div></CardContent></Card>
      <Card>
        <CardContent className="p-0">
          {recent.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No API requests logged yet. Logs populate once API keys are issued and used.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="text-left p-3">When</th><th className="text-left p-3">Method</th><th className="text-left p-3">Endpoint</th><th className="text-right p-3">Status</th><th className="text-right p-3">Duration</th></tr></thead>
              <tbody className="divide-y">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="p-3 text-xs text-muted-foreground">{format(r.createdAt, "dd MMM HH:mm:ss")}</td>
                    <td className="p-3 font-mono text-xs">{r.method}</td>
                    <td className="p-3 font-mono text-xs truncate max-w-[300px]">{r.endpoint}</td>
                    <td className="p-3 text-right tabular-nums">{r.statusCode}</td>
                    <td className="p-3 text-right tabular-nums">{r.durationMs}ms</td>
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
