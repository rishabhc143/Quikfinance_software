import { DirtyFormProvider } from "@/components/shared/dirty-form-nav";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { SettingsShell } from "@/components/shared/settings-shell";
import { getSalesPreferences } from "@/lib/sales/preferences";
import { SalesOrdersPrefsForm } from "./form";

export const metadata = { title: "Sales Order Preferences" };

export default async function SalesOrdersPreferencesPage() {
  const { organization } = await requireOrganization();
  const [prefs, templates] = await Promise.all([
    getSalesPreferences(organization.id),
    db.pdfTemplate.findMany({
      where: { organizationId: organization.id, documentType: "SALES_ORDER" },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <DirtyFormProvider><SettingsShell
      title="Sales Order Preferences"
      description="Defaults, field visibility, PDF template, and email templates for the Sales Orders module."
    >
      <SalesOrdersPrefsForm
        initial={prefs.salesOrders}
        pdfTemplates={templates.map((t) => ({ value: t.id, label: t.name }))}
      />
    </SettingsShell></DirtyFormProvider>
  );
}
