import { DirtyFormProvider } from "@/components/shared/dirty-form-nav";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { BrandingForm } from "./form";

export const metadata = { title: "Branding" };

export default async function BrandingPage() {
  const { organization } = await requireOrganization();
  const prefs = await db.organizationPreference.upsert({
    where: { organizationId: organization.id },
    update: {},
    create: { organizationId: organization.id },
  });
  return (
    <DirtyFormProvider><SettingsShell title="Branding" description="Logo, color, and how Quikfinance displays your brand on invoices and emails.">
      <Card>
        <CardContent className="pt-6">
          <BrandingForm
            initial={{
              brandColor: prefs.brandColor,
              logoUrl: organization.logoUrl,
            }}
          />
        </CardContent>
      </Card>
    </SettingsShell></DirtyFormProvider>
  );
}
