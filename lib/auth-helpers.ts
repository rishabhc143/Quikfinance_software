import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const ACTIVE_ORG_COOKIE = "qf_active_org";

export async function getCurrentUser() {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  return db.user.findUnique({
    where: { id: userId },
    include: {
      memberships: { include: { organization: true } },
    },
  });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function getActiveOrganization() {
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
}

export async function requireOrganization() {
  const result = await getActiveOrganization();
  if (!result.organization) redirect("/organizations/new");
  return {
    user: result.user,
    organization: result.organization,
    membership: result.membership!,
  };
}
