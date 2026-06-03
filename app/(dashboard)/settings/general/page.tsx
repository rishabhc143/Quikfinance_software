import { DirtyFormProvider } from "@/components/shared/dirty-form-nav";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { GeneralForm } from "./form";

export const metadata = { title: "General Settings" };

export default async function GeneralPage() {
  const { organization } = await requireOrganization();
  const prefs = await db.organizationPreference.upsert({
    where: { organizationId: organization.id },
    update: {},
    create: { organizationId: organization.id },
  });
  return (
    <DirtyFormProvider><SettingsShell title="General" description="Locale, formats, language, and timezone.">
      <Card>
        <CardContent className="pt-6">
          <GeneralForm
            initial={{
              decimalFormat: prefs.decimalFormat,
              dateFormat: prefs.dateFormat,
              timeZone: prefs.timeZone,
              language: prefs.language,
            }}
          />
        </CardContent>
      </Card>
    </SettingsShell></DirtyFormProvider>
  );
}
