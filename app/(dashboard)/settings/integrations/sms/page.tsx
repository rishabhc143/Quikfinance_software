import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { IntegrationCard } from "../_card";

export const metadata = { title: "SMS Integrations" };

export default async function Page() {
  const { organization } = await requireOrganization();
  const integration = await db.integration.findUnique({
    where: { organizationId_kind: { organizationId: organization.id, kind: "sms" } },
  });
  return (
    <SettingsShell title="SMS Integrations" description="Connect Twilio, MSG91, or another SMS gateway for outgoing alerts.">
      <Card><CardContent className="pt-6">
        <IntegrationCard kind="sms" label="SMS Integrations" connected={integration?.isConnected ?? false} />
      </CardContent></Card>
    </SettingsShell>
  );
}
