import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const ACTIVE_ORG_COOKIE = "qf_active_org";

/**
 * Request-scoped memoization (`react.cache`) — the same logical call from
 * the dashboard layout AND the page below it now resolves to the same
 * promise instead of re-running `auth()` + a heavy `db.user.findUnique`
 * for every server component in the tree.
 *
 * This is the cure for the 5-6s-per-nav perf issue: previously a single
 * sidebar click would fire `auth()` 2-3× and the user+memberships query
 * 2-3× in sequence. After this change it runs once.
 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  return db.user.findUnique({
    where: { id: userId },
    include: {
      memberships: { include: { organization: true } },
    },
  });
});

export const requireUser = cache(async () => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
});

export const getActiveOrganization = cache(async () => {
  const user = await requireUser();
  if (user.memberships.length === 0) return { user, organization: null, membership: null };

  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value;
  const fromCookie = cookieOrgId
    ? user.memberships.find((m) => m.organizationId === cookieOrgId)
    : undefined;
  const fallback =
    fromCookie ?? user.memberships.find((m) => m.isDefault) ?? user.memberships[0];

  return { user, organization: fallback.organization, membership: fallback };
});

export const requireOrganization = cache(async () => {
  const result = await getActiveOrganization();
  if (!result.organization) redirect("/organizations/new");
  return {
    user: result.user,
    organization: result.organization,
    membership: result.membership!,
  };
});
