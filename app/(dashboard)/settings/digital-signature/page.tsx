import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { DigitalSignatureForm } from "./form";

export const metadata = { title: "Digital Signature" };

export default async function DigitalSignaturePage() {
  const { organization } = await requireOrganization();
  const prefs = await db.organizationPreference.upsert({
    where: { organizationId: organization.id }, update: {},
    create: { organizationId: organization.id },
  });
  return (
    <SettingsShell title="Digital Signature" description="Cryptographically sign invoices, quotes, and PDFs. Required in some jurisdictions.">
      <Card><CardContent className="pt-6"><DigitalSignatureForm initial={prefs.digitalSignatureEnabled} /></CardContent></Card>
    </SettingsShell>
  );
}
