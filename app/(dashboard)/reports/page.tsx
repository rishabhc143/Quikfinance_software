import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { ReportsCenter } from "./reports-center";

export const metadata = { title: "Reports Center" };

/**
 * REPORTS-CENTER — Server wrapper for `/reports`.
 *
 * Hydrates the current user's favorited report keys (per-org) so the
 * client `<ReportsCenter>` can render the ☆ buttons in the right
 * initial state. Toggle is handled by the server action invoked from
 * the client component.
 */
export default async function ReportsPage() {
  const { user, organization } = await requireOrganization();

  const favorites = await db.userReportFavorite.findMany({
    where: { userId: user.id, organizationId: organization.id },
    select: { reportKey: true },
  });

  return (
    <ReportsCenter initialFavorites={favorites.map((f) => f.reportKey)} />
  );
}
