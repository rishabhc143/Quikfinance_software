import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { ReportsCenter } from "./reports-center";

export const metadata = { title: "Reports Center" };

/**
 * REPORTS-CENTER — Server wrapper for `/reports`.
 *
 * Hydrates the current user's favorited report keys (per-org) so the
 * client `<ReportsCenter>` can render the ☆ buttons in the right
 * initial state, plus their saved custom reports for the "My Reports"
 * tab. Toggle / delete are handled by server actions invoked from
 * the client component.
 */
export default async function ReportsPage() {
  const { user, organization } = await requireOrganization();

  const [favorites, customReports] = await Promise.all([
    db.userReportFavorite.findMany({
      where: { userId: user.id, organizationId: organization.id },
      select: { reportKey: true },
    }),
    db.customReport.findMany({
      where: { userId: user.id, organizationId: organization.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        reportKey: true,
        params: true,
        createdAt: true,
      },
    }),
  ]);

  return (
    <ReportsCenter
      initialFavorites={favorites.map((f) => f.reportKey)}
      initialCustomReports={customReports.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      }))}
    />
  );
}
