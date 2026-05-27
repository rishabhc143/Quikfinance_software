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

  // Fail-open: the Reports Center must always render. A missing table
  // (e.g. a migration not yet applied to this environment) or a transient
  // DB error should degrade to empty favorites / empty My Reports — never
  // the generic Next.js error screen. Mirrors the house `safeCount` /
  // `getRecentReportActivity` fail-open pattern. Each query falls back
  // independently so one failing table doesn't blank out the other.
  const [favorites, customReports] = await Promise.all([
    db.userReportFavorite
      .findMany({
        where: { userId: user.id, organizationId: organization.id },
        select: { reportKey: true },
      })
      .catch((err) => {
        console.error("[reports] failed to load favorites:", err);
        return [];
      }),
    db.customReport
      .findMany({
        where: { userId: user.id, organizationId: organization.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          reportKey: true,
          params: true,
          createdAt: true,
        },
      })
      .catch((err) => {
        console.error("[reports] failed to load custom reports:", err);
        return [];
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
