import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { LocationsManager } from "./manager";

export const metadata = { title: "Locations" };

export default async function LocationsPage() {
  const { organization } = await requireOrganization();
  const locations = await db.location.findMany({
    where: { organizationId: organization.id },
    orderBy: { name: "asc" },
  });
  return (
    <SettingsShell title="Locations" description="Branches, warehouses, or storefronts. Used by inventory and tax calculations.">
      <Card>
        <CardContent className="pt-6">
          <LocationsManager initial={locations.map((l) => ({ id: l.id, name: l.name, address: l.address ?? "", isPrimary: l.isPrimary }))} />
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
