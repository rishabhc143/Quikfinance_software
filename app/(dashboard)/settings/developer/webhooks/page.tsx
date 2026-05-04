import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { WebhooksManager } from "./manager";

export const metadata = { title: "Incoming Webhooks" };

export default async function WebhooksPage() {
  const { organization } = await requireOrganization();
  const rows = await db.webhook.findMany({ where: { organizationId: organization.id }, orderBy: { event: "asc" } });
  return (
    <SettingsShell title="Incoming Webhooks" description="Subscribe to Quikfinance events with HTTP callbacks.">
      <Card><CardContent className="pt-6">
        <WebhooksManager initial={rows.map((w) => ({ id: w.id, url: w.url, event: w.event, isActive: w.isActive }))} />
      </CardContent></Card>
    </SettingsShell>
  );
}
