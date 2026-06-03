import { DirtyFormProvider } from "@/components/shared/dirty-form-nav";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { PortalForm } from "./form";

export const metadata = { title: "Customer Portal" };

export default async function CustomerPortalPage() {
  const { organization } = await requireOrganization();
  const prefs = await db.organizationPreference.upsert({
    where: { organizationId: organization.id }, update: {},
    create: { organizationId: organization.id },
  });
  return (
    <DirtyFormProvider><SettingsShell title="Customer Portal" description="Self-service portal for customers to view invoices and pay online.">
      <Card>
        <CardContent className="pt-6">
          <PortalForm
            label="Customer portal"
            description="When enabled, customers receive a magic link to view their invoices, statements, and pay online."
            prefKey="customerPortalEnabled"
            initialEnabled={prefs.customerPortalEnabled}
            slug={organization.slug}
            kind="customer"
          />
        </CardContent>
      </Card>
    </SettingsShell></DirtyFormProvider>
  );
}
