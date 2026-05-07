import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { SettingsShell } from "@/components/shared/settings-shell";
import { getSalesPreferences } from "@/lib/sales/preferences";
import { InvoicesPrefsForm } from "./form";

export const metadata = { title: "Invoice Preferences" };

export default async function InvoicesPreferencesPage() {
  const { organization } = await requireOrganization();
  const [prefs, templates] = await Promise.all([
    getSalesPreferences(organization.id),
    db.pdfTemplate.findMany({
      where: { organizationId: organization.id, documentType: "INVOICE" },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <SettingsShell
      title="Invoice Preferences"
      description="Defaults, reminders, field visibility, PDF template, and email templates for the Invoices module."
    >
      <InvoicesPrefsForm
        initial={prefs.invoices}
        pdfTemplates={templates.map((t) => ({ value: t.id, label: t.name }))}
      />
    </SettingsShell>
  );
}
