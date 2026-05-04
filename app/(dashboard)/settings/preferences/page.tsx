import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { UserPreferencesForm } from "./form";

export const metadata = { title: "User Preferences" };

export default async function UserPreferencesPage() {
  const { organization } = await requireOrganization();
  const prefs = await db.organizationPreference.upsert({
    where: { organizationId: organization.id }, update: {},
    create: { organizationId: organization.id },
  });
  return (
    <SettingsShell title="User Preferences" description="Defaults applied to everyone in this organization.">
      <Card>
        <CardContent className="pt-6">
          <UserPreferencesForm initial={{ themeDefault: prefs.themeDefault, densityDefault: prefs.densityDefault }} />
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
