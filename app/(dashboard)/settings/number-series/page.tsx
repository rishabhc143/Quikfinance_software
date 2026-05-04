import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { NumberSeriesManager } from "./manager";

export const metadata = { title: "Transaction Number Series" };

export default async function NumberSeriesPage() {
  const { organization } = await requireOrganization();
  const series = await db.numberSeries.findMany({
    where: { organizationId: organization.id },
    orderBy: { module: "asc" },
  });
  return (
    <SettingsShell title="Transaction Number Series" description="Prefixes and counters used to number invoices, bills, quotes, and more.">
      <Card>
        <CardContent className="pt-6">
          <NumberSeriesManager initial={series.map((s) => ({ id: s.id, module: s.module, prefix: s.prefix, nextValue: s.nextValue, padding: s.padding }))} />
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
