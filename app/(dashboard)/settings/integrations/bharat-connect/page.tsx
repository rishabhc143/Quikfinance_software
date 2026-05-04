import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { IntegrationCard } from "../_card";

export const metadata = { title: "Bharat Connect" };

export default async function Page() {
  const { organization } = await requireOrganization();
  const integration = await db.integration.findUnique({
    where: { organizationId_kind: { organizationId: organization.id, kind: "bharat-connect" } },
  });
  return (
    <SettingsShell title="Bharat Connect" description="Government e-invoice / e-way-bill integration for Indian businesses.">
      <Card><CardContent className="pt-6">
        <IntegrationCard kind="bharat-connect" label="Bharat Connect" connected={integration?.isConnected ?? false} />
      </CardContent></Card>
    </SettingsShell>
  );
}
