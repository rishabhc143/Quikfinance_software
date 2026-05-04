import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { PortalForm } from "../customer-portal/form";

export const metadata = { title: "Vendor Portal" };

export default async function VendorPortalPage() {
  const { organization } = await requireOrganization();
  const prefs = await db.organizationPreference.upsert({
    where: { organizationId: organization.id }, update: {},
    create: { organizationId: organization.id },
  });
  return (
    <SettingsShell title="Vendor Portal" description="Self-service portal for vendors to submit bills and view payment status.">
      <Card>
        <CardContent className="pt-6">
          <PortalForm
            label="Vendor portal"
            description="When enabled, vendors receive a magic link to submit bills and check payment status."
            prefKey="vendorPortalEnabled"
            initialEnabled={prefs.vendorPortalEnabled}
            slug={organization.slug}
            kind="vendor"
          />
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
