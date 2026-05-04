import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { MsmeForm } from "./form";

export const metadata = { title: "MSME Settings" };

export default async function MsmePage() {
  const { organization } = await requireOrganization();
  const prefs = await db.organizationPreference.upsert({
    where: { organizationId: organization.id }, update: {},
    create: { organizationId: organization.id },
  });
  return (
    <SettingsShell title="MSME Settings" description="Micro, Small & Medium Enterprises identification and reporting flags.">
      <Card>
        <CardContent className="pt-6">
          <MsmeForm initial={{ registered: prefs.msmeRegistered, number: prefs.msmeNumber ?? "" }} />
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
