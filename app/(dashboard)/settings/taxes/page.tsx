import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { TaxesManager } from "./manager";

export const metadata = { title: "Taxes" };

export default async function TaxesPage() {
  const { organization } = await requireOrganization();
  const taxes = await db.tax.findMany({
    where: { organizationId: organization.id },
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
  });
  return (
    <SettingsShell title="Taxes" description="Tax codes used on invoices, bills, and quotes. GST, VAT, sales tax — all live here.">
      <Card>
        <CardContent className="pt-6">
          <TaxesManager
            initial={taxes.map((t) => ({
              id: t.id,
              name: t.name,
              rate: Number(t.rate),
              type: t.type,
              isCompound: t.isCompound,
              isActive: t.isActive,
            }))}
          />
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
