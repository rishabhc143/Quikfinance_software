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
 *   importCoaAction    — persists the previewed rows. Two modes:
 *
 *     "skip"      — Default behaviour. Rows whose name (or
 *                    code) collides with an existing account are
 *                    silently skipped + reported in `errors`.
 *
 *     "overwrite" — Rows whose name matches an existing account
 *                    update that row (description / subType / code /
 *                    status are refreshed; type stays fixed because
 *                    changing it would break every JE that posts to
 *                    the account). SYS-* rows are never overwritten.
 */

export type DuplicateMode = "skip" | "overwrite";

export async function parseCoaCsvAction(csv: string): Promise<ParseResult> {
  await requireOrganization();
  return parseCoaCsv(csv);
}

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { name: string; message: string }[];
};

export async function importCoaAction(
  rows: ParsedCoaRow[],
  mode: DuplicateMode = "skip"
): Promise<ImportResult> {
  const { user, organization } = await requireOrganization();
  if (rows.length === 0) {
    return { created: 0, updated: 0, skipped: 0, errors: [] };
  }

  const existing = await db.chartOfAccount.findMany({
    where: { organizationId: organization.id },
    select: { id: true, name: true, code: true, type: true },
  });
  const byName = new Map(
    existing.map((a) => [a.name.trim().toLowerCase(), a])
  );
  const existingCodes = new Set(
    existing.map((a) => a.code).filter((c): c is string => !!c)
  );

  const errors: { name: string; message: string }[] = [];
  const toInsert: ParsedCoaRow[] = [];
  const toUpdate: Array<{ id: string; row: ParsedCoaRow }> = [];

  for (const r of rows) {
    const nameLower = r.name.trim().toLowerCase();
    const dupe = byName.get(nameLower);

    if (dupe) {
      // Refuse to touch SYS-* in either mode — they're code-pinned.
      if (dupe.code?.startsWith("SYS-")) {
        errors.push({
          name: r.name,
          message: `"${r.name}" is a system account; can't be modified by import.`,
        });
        continue;
      }
      if (mode === "skip") {
        errors.push({
          name: r.name,
          message: `An account named "${r.name}" already exists — skipped.`,
        });
        continue;
      }
      // Overwrite — but never change the locked AccountType.
      if (dupe.type !== r.type) {
        errors.push({
          name: r.name,
          message: `Existing "${r.name}" has type ${dupe.type}; type can't be changed by import.`,
        });
        continue;
      }
      toUpdate.push({ id: dupe.id, row: r });
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

  const created = toInsert.length;
  const updated = toUpdate.length;
  const skipped = errors.length;

  if (toInsert.length === 0 && toUpdate.length === 0) {
    return { created: 0, updated: 0, skipped, errors };
  }

  await db.$transaction(async (tx) => {
    if (toInsert.length > 0) {
      await tx.chartOfAccount.createMany({
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
    }
    for (const { id, row } of toUpdate) {
      await tx.chartOfAccount.update({
        where: { id },
        data: {
          code: row.code,
          // name stays the same (the dedup is by name)
          subType: row.subType,
          description: row.description,
          isActive: row.isActive,
        },
      });
    }
  });

  if (created > 0 || updated > 0) {
    await writeAuditLog({
      organizationId: organization.id,
      userId: user.id,
      action: "CREATE",
      entityType: "ChartOfAccount",
      entityId: "bulk-import",
      after: {
        kind: "csv_import",
        mode,
        created,
        updated,
        skipped,
        errors: errors.length,
      },
    });
    revalidatePath("/accountant/chart-of-accounts");
  }

  return { created, updated, skipped, errors };
}
