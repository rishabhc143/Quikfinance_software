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

/**
 * REPORTS-CENTER — Save a customized report view under the current
 * user's "My Reports" tab. A custom report is { name, reportKey,
 * params } where `params` is the report page's `exportParams` URL
 * query string (filters/columns), stored verbatim.
 *
 * Validates `reportKey` against the static catalog so an attacker
 * can't insert arbitrary strings. The (user, org, name) unique index
 * enforces one name per user+org — a duplicate surfaces as a friendly
 * error rather than a 500 (Prisma P2002).
 */

const createCustomReportSchema = z.object({
  name: z.string().min(1).max(120),
  reportKey: z.string().min(1).max(80),
  params: z.string().max(4000).default(""),
});

export type CreateCustomReportInput = z.input<typeof createCustomReportSchema>;

export async function createCustomReportAction(
  input: CreateCustomReportInput
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const { user, organization } = await requireOrganization();
  const data = createCustomReportSchema.parse(input);

  const name = data.name.trim();
  if (!name) {
    return { ok: false, error: "Name is required." };
  }

  if (!findReport(data.reportKey)) {
    return { ok: false, error: "Unknown report key" };
  }

  try {
    const created = await db.customReport.create({
      data: {
        userId: user.id,
        organizationId: organization.id,
        reportKey: data.reportKey,
        name,
        params: data.params,
      },
      select: { id: true },
    });
    revalidatePath("/reports");
    return { ok: true, id: created.id };
  } catch (err) {
    // Prisma P2002 = unique-constraint violation on (user, org, name).
    if (
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "P2002"
    ) {
      return {
        ok: false,
        error: "A custom report with that name already exists.",
      };
    }
    throw err;
  }
}

/**
 * REPORTS-CENTER — Delete a saved custom report. Scoped to the
 * current org (deleteMany with an org guard) so a user can't remove
 * another org's row by id.
 */

const deleteCustomReportSchema = z.object({
  id: z.string().min(1),
});

export type DeleteCustomReportInput = z.input<typeof deleteCustomReportSchema>;

export async function deleteCustomReportAction(
  input: DeleteCustomReportInput
): Promise<{ ok: boolean; error?: string }> {
  const { organization } = await requireOrganization();
  const data = deleteCustomReportSchema.parse(input);

  await db.customReport.deleteMany({
    where: { id: data.id, organizationId: organization.id },
  });
  revalidatePath("/reports");
  return { ok: true };
}
