import { DirtyFormProvider } from "@/components/shared/dirty-form-nav";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { DirectTaxesForm } from "./form";

export const metadata = { title: "Direct Taxes" };

export default async function DirectTaxesPage() {
  const { organization } = await requireOrganization();
  const prefs = await db.organizationPreference.upsert({
    where: { organizationId: organization.id }, update: {},
    create: { organizationId: organization.id },
  });
  return (
    <DirtyFormProvider><SettingsShell title="Direct Taxes" description="TDS / withholding tax configuration and ID numbers.">
      <Card>
        <CardContent className="pt-6">
          <DirectTaxesForm initial={{ tdsEnabled: prefs.tdsEnabled, tan: prefs.tanNumber ?? "", pan: prefs.panNumber ?? "" }} />
        </CardContent>
      </Card>
    </SettingsShell></DirtyFormProvider>
  );
}
