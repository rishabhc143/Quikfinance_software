"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  parseCoaCsv,
  type ParseResult,
  type ParsedCoaRow,
} from "@/lib/accounting/coa-import";

/**
 * ACCT-E.4 — Server actions for the Chart of Accounts CSV import.
 *
 *   parseCoaCsvAction  — pure parse + validate; no DB writes.
 *   importCoaAction    — persists the previewed rows. Uses
 *                         createMany + skipDuplicates against the
 *                         (org, LOWER(TRIM(name))) partial unique
 *                         index so a row whose name collides with
 *                         an existing account is silently skipped.
 */

export async function parseCoaCsvAction(csv: string): Promise<ParseResult> {
  await requireOrganization();
  return parseCoaCsv(csv);
}

export type ImportResult = {
  created: number;
  skipped: number;
  errors: { name: string; message: string }[];
};

export async function importCoaAction(
  rows: ParsedCoaRow[]
): Promise<ImportResult> {
  const { user, organization } = await requireOrganization();
  if (rows.length === 0) {
    return { created: 0, skipped: 0, errors: [] };
  }

  // Skip rows whose name already exists (case-insensitive). The
  // partial unique index would block them at the DB layer anyway,
  // but reporting them clearly avoids a confusing "0 created"
  // result with no explanation.
  const existing = await db.chartOfAccount.findMany({
    where: { organizationId: organization.id },
    select: { name: true, code: true },
  });
  const existingNames = new Set(
    existing.map((a) => a.name.trim().toLowerCase())
  );
  const existingCodes = new Set(
    existing.map((a) => a.code).filter((c): c is string => !!c)
  );

  const errors: { name: string; message: string }[] = [];
  const toInsert: ParsedCoaRow[] = [];
  for (const r of rows) {
    if (existingNames.has(r.name.trim().toLowerCase())) {
      errors.push({
        name: r.name,
        message: `An account named "${r.name}" already exists — skipped.`,
      });
      continue;
    }
    if (r.code && existingCodes.has(r.code)) {
      errors.push({
        name: r.name,
        message: `Code "${r.code}" is already in use — skipped.`,
      });
      continue;
    }
    toInsert.push(r);
  }
  const skipped = errors.length;

  if (toInsert.length === 0) {
    return { created: 0, skipped, errors };
  }

  const res = await db.chartOfAccount.createMany({
    data: toInsert.map((r) => ({
      organizationId: organization.id,
      code: r.code,
      name: r.name,
      type: r.type,
      subType: r.subType,
      description: r.description,
      isActive: r.isActive,
    })),
    skipDuplicates: true,
  });

  if (res.count > 0) {
    await writeAuditLog({
      organizationId: organization.id,
      userId: user.id,
      action: "CREATE",
      entityType: "ChartOfAccount",
      entityId: "bulk-import",
      after: {
        kind: "csv_import",
        created: res.count,
        skipped,
        errors: errors.length,
      },
    });
    revalidatePath("/accountant/chart-of-accounts");
  }

  return { created: res.count, skipped, errors };
}
