"use server";

import { revalidatePath } from "next/cache";
import { parse as parseCsvText } from "csv-parse/sync";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  parseCsv,
  type CsvColumnMap,
  type RowError,
} from "@/lib/banking/csv-import";
import { markDuplicates } from "@/lib/banking/duplicate-detection";

/**
 * BNK-A — Server actions for the per-account import flow.
 *
 *   importBankStatementAction — accepts raw CSV text + column map +
 *     amount-column-type, parses, marks duplicates, inserts everything
 *     under one BankImportBatch (so Undo can find them).
 *
 *   saveImportPresetAction    — stash a successful column map for next
 *     month's import.
 *
 *   undoLastImportAction      — delete the most recent batch and all its
 *     transactions. Guarded by reconciliation status (matched/cleared
 *     rows can't be undone without manual unmark first).
 */

export type ImportResult = {
  batchId: string;
  parsed: number;
  inserted: number;
  duplicates: number;
  errors: RowError[];
};

export async function importBankStatementAction(input: {
  bankAccountId: string;
  csvText: string;
  fileName: string;
  columnMap: CsvColumnMap;
}): Promise<ImportResult> {
  const { user, organization } = await requireOrganization();

  // Confirm the account belongs to this org (prevent cross-tenant writes).
  const account = await db.bankAccount.findFirst({
    where: {
      id: input.bankAccountId,
      organizationId: organization.id,
      isActive: true,
    },
  });
  if (!account) throw new Error("Bank account not found");

  // Step 1 — raw CSV → header-keyed rows.
  let rows: Record<string, string>[];
  try {
    rows = parseCsvText(input.csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];
  } catch (err) {
    throw new Error(
      `CSV parse failed: ${err instanceof Error ? err.message : "unknown"}`
    );
  }

  // Step 2 — apply column map.
  const { rows: parsed, errors } = parseCsv(rows, input.columnMap);

  // Step 3 — duplicate detection against the existing per-account history.
  // We pull the last 365 days of transactions (anything older isn't a
  // realistic duplicate of a fresh statement upload).
  const existing = await db.bankTransaction.findMany({
    where: {
      bankAccountId: account.id,
      date: {
        gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      },
    },
    select: { id: true, date: true, amount: true, reference: true },
  });
  const annotated = markDuplicates(parsed, existing);

  // Step 4 — one BankImportBatch + N BankTransaction rows in a
  // transaction so Undo can find them later.
  const result = await db.$transaction(async (tx) => {
    const batch = await tx.bankImportBatch.create({
      data: {
        organizationId: organization.id,
        bankAccountId: account.id,
        uploadedById: user.id,
        fileName: input.fileName,
        rowCount: annotated.length,
        duplicateCount: annotated.filter((r) => r.duplicateOfId).length,
      },
    });

    if (annotated.length > 0) {
      await tx.bankTransaction.createMany({
        data: annotated.map((r) => ({
          organizationId: organization.id,
          bankAccountId: account.id,
          date: r.date,
          description: r.description,
          reference: r.reference,
          amount: r.amount,
          type: r.type,
          excluded: !!r.duplicateOfId,
          excludedReason: r.duplicateReason,
          importBatchId: batch.id,
        })),
      });
    }

    return {
      batchId: batch.id,
      parsed: parsed.length,
      inserted: annotated.length,
      duplicates: annotated.filter((r) => r.duplicateOfId).length,
      errors,
    };
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "BankImportBatch",
    entityId: result.batchId,
    after: {
      bankAccountId: account.id,
      fileName: input.fileName,
      parsed: result.parsed,
      inserted: result.inserted,
      duplicates: result.duplicates,
      errors: result.errors.length,
    },
  });

  revalidatePath(`/banking/accounts/${account.id}`);
  revalidatePath("/banking");
  return result;
}

export async function saveImportPresetAction(input: {
  bankAccountId: string;
  name: string;
  columnMap: CsvColumnMap;
  encoding?: string;
  delimiter?: string;
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { user, organization } = await requireOrganization();
  const account = await db.bankAccount.findFirst({
    where: { id: input.bankAccountId, organizationId: organization.id },
  });
  if (!account) return { ok: false, error: "Bank account not found" };

  try {
    const created = await db.bankImportPreset.create({
      data: {
        organizationId: organization.id,
        bankAccountId: account.id,
        name: input.name.trim().slice(0, 80),
        amountColumnType: input.columnMap.amountColumnType,
        encoding: input.encoding ?? "utf-8",
        delimiter: input.delimiter ?? ",",
        columnMapJson: input.columnMap as unknown as object,
      },
    });
    await writeAuditLog({
      organizationId: organization.id,
      userId: user.id,
      action: "CREATE",
      entityType: "BankImportPreset",
      entityId: created.id,
      after: { name: created.name, bankAccountId: account.id },
    });
    revalidatePath(`/banking/accounts/${account.id}`);
    return { ok: true, id: created.id };
  } catch (err) {
    // Likely a unique-violation on (bankAccountId, name).
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Save failed",
    };
  }
}

export async function undoLastImportAction(bankAccountId: string): Promise<{
  ok: boolean;
  deleted?: number;
  error?: string;
}> {
  const { user, organization } = await requireOrganization();
  const account = await db.bankAccount.findFirst({
    where: { id: bankAccountId, organizationId: organization.id },
  });
  if (!account) return { ok: false, error: "Bank account not found" };

  const lastBatch = await db.bankImportBatch.findFirst({
    where: { bankAccountId: account.id, organizationId: organization.id },
    orderBy: { createdAt: "desc" },
  });
  if (!lastBatch) {
    return { ok: false, error: "No import batches to undo." };
  }

  // Refuse to undo a batch whose transactions have been reconciled
  // (manual reconciliation comes in BNK-F; for v1 we just guard on
  // isReconciled to be future-proof).
  const reconciledCount = await db.bankTransaction.count({
    where: { importBatchId: lastBatch.id, isReconciled: true },
  });
  if (reconciledCount > 0) {
    return {
      ok: false,
      error: `${reconciledCount} transaction${
        reconciledCount === 1 ? " has" : "s have"
      } been reconciled. Unmark them first, then undo.`,
    };
  }

  const result = await db.$transaction(async (tx) => {
    const del = await tx.bankTransaction.deleteMany({
      where: { importBatchId: lastBatch.id },
    });
    await tx.bankImportBatch.delete({ where: { id: lastBatch.id } });
    return del.count;
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "BankImportBatch",
    entityId: lastBatch.id,
    before: { rowCount: lastBatch.rowCount },
    after: { deleted: result },
  });

  revalidatePath(`/banking/accounts/${account.id}`);
  revalidatePath("/banking");
  return { ok: true, deleted: result };
}
