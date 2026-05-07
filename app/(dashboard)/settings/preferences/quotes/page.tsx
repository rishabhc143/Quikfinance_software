import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { SettingsShell } from "@/components/shared/settings-shell";
import { getSalesPreferences } from "@/lib/sales/preferences";
import { QuotesPrefsForm } from "./form";

export const metadata = { title: "Quote Preferences" };

export default async function QuotesPreferencesPage() {
  const { organization } = await requireOrganization();

  const [prefs, templates] = await Promise.all([
    getSalesPreferences(organization.id),
    db.pdfTemplate.findMany({
      where: { organizationId: organization.id, documentType: "QUOTE" },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <SettingsShell
      title="Quote Preferences"
      description="Defaults, field visibility, PDF template, and email templates for the Quotes module."
    >
      <QuotesPrefsForm
        initial={prefs.quotes}
        pdfTemplates={templates.map((t) => ({ value: t.id, label: t.name }))}
      />
    </SettingsShell>
  );
}
