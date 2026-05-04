import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { IntegrationCard } from "../_card";

export const metadata = { title: "Uber for Business" };

export default async function Page() {
  const { organization } = await requireOrganization();
  const integration = await db.integration.findUnique({
    where: { organizationId_kind: { organizationId: organization.id, kind: "uber" } },
  });
  return (
    <SettingsShell title="Uber for Business" description="Pull Uber for Business expenses directly into Quikfinance.">
      <Card><CardContent className="pt-6">
        <IntegrationCard kind="uber" label="Uber for Business" connected={integration?.isConnected ?? false} />
      </CardContent></Card>
    </SettingsShell>
  );
}
