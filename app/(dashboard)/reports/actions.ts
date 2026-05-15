"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { findReport } from "@/lib/reports/catalog";

/**
 * REPORTS-CENTER — Toggle a report's favorite state for the current
 * user in the current org. Server action used by the ☆ button in
 * the Reports Center table.
 *
 *   - If a UserReportFavorite row already exists → delete it
 *     (un-favorite).
 *   - Otherwise → create one (favorite).
 *
 * Validates `reportKey` against the static catalog so an attacker
 * can't insert arbitrary strings.
 */

const toggleSchema = z.object({
  reportKey: z.string().min(1).max(80),
});

export type ToggleReportFavoriteInput = z.input<typeof toggleSchema>;

export async function toggleReportFavoriteAction(
  input: ToggleReportFavoriteInput
): Promise<{ ok: boolean; favorited?: boolean; error?: string }> {
  const { user, organization } = await requireOrganization();
  const data = toggleSchema.parse(input);

  if (!findReport(data.reportKey)) {
    return { ok: false, error: "Unknown report key" };
  }

  const existing = await db.userReportFavorite.findUnique({
    where: {
      userId_organizationId_reportKey: {
        userId: user.id,
        organizationId: organization.id,
        reportKey: data.reportKey,
      },
    },
    select: { id: true },
  });

  if (existing) {
    await db.userReportFavorite.delete({ where: { id: existing.id } });
    revalidatePath("/reports");
    return { ok: true, favorited: false };
  }

  await db.userReportFavorite.create({
    data: {
      userId: user.id,
      organizationId: organization.id,
      reportKey: data.reportKey,
    },
  });
  revalidatePath("/reports");
  return { ok: true, favorited: true };
}
