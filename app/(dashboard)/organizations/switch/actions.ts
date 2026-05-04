"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, ACTIVE_ORG_COOKIE } from "@/lib/auth-helpers";

export async function switchOrganization(orgId: string) {
  const user = await requireUser();
  const ok = await db.organizationMembership.findUnique({
    where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
  });
  if (!ok) throw new Error("Not a member of that organization");

  const store = await cookies();
  store.set(ACTIVE_ORG_COOKIE, orgId, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  return { ok: true };
}
