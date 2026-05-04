import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { IntegrationCard } from "../_card";

export const metadata = { title: "Other Apps" };

export default async function Page() {
  const { organization } = await requireOrganization();
  const integration = await db.integration.findUnique({
    where: { organizationId_kind: { organizationId: organization.id, kind: "other" } },
  });
  return (
    <SettingsShell title="Other Apps" description="Zapier, Make, IFTTT — connect Quikfinance to thousands of apps.">
      <Card><CardContent className="pt-6">
        <IntegrationCard kind="other" label="Other Apps" connected={integration?.isConnected ?? false} />
      </CardContent></Card>
    </SettingsShell>
  );
}
