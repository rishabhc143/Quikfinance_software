import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { IntegrationCard } from "../_card";

export const metadata = { title: "WhatsApp" };

export default async function Page() {
  const { organization } = await requireOrganization();
  const integration = await db.integration.findUnique({
    where: { organizationId_kind: { organizationId: organization.id, kind: "whatsapp" } },
  });
  return (
    <SettingsShell title="WhatsApp" description="Send invoices, payment reminders, and receipts via WhatsApp Business.">
      <Card><CardContent className="pt-6">
        <IntegrationCard kind="whatsapp" label="WhatsApp" connected={integration?.isConnected ?? false} />
      </CardContent></Card>
    </SettingsShell>
  );
}
