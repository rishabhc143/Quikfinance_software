import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { IntegrationCard } from "../_card";

export const metadata = { title: "Quikfinance Apps" };

export default async function Page() {
  const { organization } = await requireOrganization();
  const integration = await db.integration.findUnique({
    where: { organizationId_kind: { organizationId: organization.id, kind: "apps" } },
  });
  return (
    <SettingsShell title="Quikfinance Apps" description="First-party apps, mobile clients, and add-ons published by Quikfinance.">
      <Card><CardContent className="pt-6">
        <IntegrationCard kind="apps" label="Quikfinance Apps" connected={integration?.isConnected ?? false} />
      </CardContent></Card>
    </SettingsShell>
  );
}
