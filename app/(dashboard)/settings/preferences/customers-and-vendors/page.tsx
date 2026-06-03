import { DirtyFormProvider } from "@/components/shared/dirty-form-nav";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { SettingsShell } from "@/components/shared/settings-shell";
import { getSalesPreferences } from "@/lib/sales/preferences";
import { CustomersPrefsForm } from "./form";

export const metadata = { title: "Customers & Vendors Preferences" };

export default async function CustomersPreferencesPage() {
  const { organization } = await requireOrganization();
  const [prefs, paymentTerms] = await Promise.all([
    getSalesPreferences(organization.id),
    db.paymentTerms.findMany({
      where: { organizationId: organization.id },
      orderBy: { numberOfDays: "asc" },
    }),
  ]);
  return (
    <DirtyFormProvider><SettingsShell
      title="Customers & Vendors Preferences"
      description="Defaults and field visibility for the Customers and Vendors modules."
    >
      <CustomersPrefsForm
        initial={prefs.customers}
        paymentTerms={paymentTerms.map((p) => ({ value: p.id, label: p.name }))}
      />
    </SettingsShell></DirtyFormProvider>
  );
}
