"use server";

import { revalidatePath } from "next/cache";
import { parse as parseCsvText } from "csv-parse/sync";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import {
  parseCsv,
  type CsvColumnMap,
  type ParsedRow,
  type RowError,
} from "@/lib/banking/csv-import";
import { markDuplicates } from "@/lib/banking/duplicate-detection";
import {
  firstMatchingRule,
  type BankLineFacts,
  type RuleCondition,
  type RuleCombinator,
} from "@/lib/banking/rule-engine";
import { validateGLForDirection } from "@/lib/banking/categorise";
import { applyCategorise } from "@/lib/banking/apply-categorise";
import {
  detectFormat,
  type BankStatementFormat,
} from "@/lib/banking/format-detection";
import { parseQif } from "@/lib/banking/parsers/qif";
import { parseOfx } from "@/lib/banking/parsers/ofx";
import { parseCamt053 } from "@/lib/banking/parsers/camt053";
import type { AccountType, Prisma } from "@prisma/client";

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
  /** Raw file text (CSV, OFX, QIF, or CAMT.053 XML). Field name kept
   *  for backwards compat — was originally CSV-only. */
  csvText: string;
  fileName: string;
  /** BNK-A: column map for CSV. Required when format = "CSV". For
   *  OFX/QIF/CAMT.053 the parsers have fixed schemas so this is
   *  ignored. */
  columnMap?: CsvColumnMap;
  /** BNK-G: explicit format. If omitted, we sniff it from fileName +
   *  content. */
  format?: BankStatementFormat;
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

  // BNK-G — route by format. CSV path is unchanged (still uses the
  // column-map). OFX / QIF / CAMT.053 each have a dedicated parser
  // returning the same ParsedRow[] shape.
  const format: BankStatementFormat =
    input.format ?? detectFormat(input.fileName, input.csvText);

  let parsed: ParsedRow[];
  let errors: RowError[];
  let fileCurrency: string | undefined;

  if (format === "CSV") {
    if (!input.columnMap) {
      throw new Error("CSV imports require a column map.");
    }
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
    const csvResult = parseCsv(rows, input.columnMap);
    parsed = csvResult.rows;
    errors = csvResult.errors;
  } else {
    const parser =
      format === "OFX" ? parseOfx : format === "QIF" ? parseQif : parseCamt053;
    const result = parser(input.csvText);
    parsed = result.rows;
    errors = result.errors;
    fileCurrency = result.currency;
  }

  // BNK-G — currency guard. If the file declared a currency that
  // doesn't match the bank account's, refuse rather than silently
  // mixing the books.
  if (
    fileCurrency &&
    fileCurrency.toUpperCase() !== account.currency.toUpperCase()
  ) {
    throw new Error(
      `Currency mismatch: account is ${account.currency}, file says ${fileCurrency}.`
    );
  }

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
  // transaction so Undo can find them later. We use
  // createManyAndReturn (Prisma 5.14+) to keep the inserted ids for
  // BNK-E rule application below.
  const { result, insertedTxns } = await db.$transaction(async (tx) => {
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

    let insertedTxns: Array<{
      id: string;
      type: string;
      description: string | null;
      reference: string | null;
      amount: Prisma.Decimal;
      date: Date;
      bankAccountId: string;
      excluded: boolean;
    }> = [];
    if (annotated.length > 0) {
      insertedTxns = await tx.bankTransaction.createManyAndReturn({
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
        select: {
          id: true,
          type: true,
          description: true,
          reference: true,
          amount: true,
          date: true,
          bankAccountId: true,
          excluded: true,
        },
      });
    }

    return {
      result: {
        batchId: batch.id,
        parsed: parsed.length,
        inserted: annotated.length,
        duplicates: annotated.filter((r) => r.duplicateOfId).length,
        errors,
      },
      insertedTxns,
    };
  });

  // Step 5 — BNK-E. Fire transaction rules against the just-inserted
  // (non-duplicate) rows. Per-account rules win over org-wide ones;
  // within each scope, lower priority wins. First-match-wins per row.
  await applyRulesToImportedTxns({
    organizationId: organization.id,
    userId: user.id,
    bankAccountId: account.id,
    insertedTxns,
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

/**
 * BNK-E — Post-import rule application. Called from
 * `importBankStatementAction` after the batch commits. For each
 * non-excluded inserted bank line:
 *
 *   1. Find the first matching active rule (per-account first, then
 *      org-wide; within each scope, ascending priority).
 *   2. Skip if the rule's GL account doesn't match the line direction
 *      (defensive — the rule form lets the user pick any GL, since a
 *      "amount > X" rule could plausibly fire on either direction).
 *   3. Call applyCategorise() to do the actual create + audit + stamp.
 *   4. Swallow per-row errors (a misconfigured rule shouldn't tank the
 *      whole import) — just log and continue.
 *
 * No-ops if there are no active rules.
 */
async function applyRulesToImportedTxns(input: {
  organizationId: string;
  userId: string;
  bankAccountId: string;
  insertedTxns: Array<{
    id: string;
    type: string;
    description: string | null;
    reference: string | null;
    amount: Prisma.Decimal;
    date: Date;
    bankAccountId: string;
    excluded: boolean;
  }>;
}): Promise<void> {
  const eligible = input.insertedTxns.filter((t) => !t.excluded);
  if (eligible.length === 0) return;

  const rules = await db.bankRule.findMany({
    where: {
      organizationId: input.organizationId,
      isActive: true,
      OR: [
        { bankAccountId: input.bankAccountId },
        { bankAccountId: null },
      ],
    },
    // Per-account rules (non-null bankAccountId) sort first, then by
    // ascending priority. Postgres nulls-last with desc sort gives us
    // exactly that.
    orderBy: [{ bankAccountId: "desc" }, { priority: "asc" }],
    include: {
      actionGlAccount: { select: { id: true, name: true, type: true } },
    },
  });
  if (rules.length === 0) return;

  for (const row of eligible) {
    const facts: BankLineFacts = {
      description: row.description,
      reference: row.reference,
      amount: Number(row.amount),
      type: row.type === "CREDIT" ? "CREDIT" : "DEBIT",
    };
    const rule = firstMatchingRule(
      facts,
      rules.map((r) => ({
        ...r,
        conditions: (r.conditionsJson as unknown as RuleCondition[]) ?? [],
        combinator: r.combinator as RuleCombinator,
      }))
    );
    if (!rule) continue;
    // Sanity: skip if the GL account doesn't fit the bank-line direction.
    const directionErr = validateGLForDirection(
      facts.type,
      rule.actionGlAccount.type as AccountType
    );
    if (directionErr) continue;
    try {
      await applyCategorise({
        organizationId: input.organizationId,
        userId: input.userId,
        bankTxn: {
          id: row.id,
          bankAccountId: row.bankAccountId,
          date: row.date,
          amount: row.amount,
          type: row.type,
          description: row.description,
          reference: row.reference,
        },
        glAccount: rule.actionGlAccount,
        notes: rule.actionNotes ?? null,
        ruleId: rule.id,
      });
    } catch {
      // Swallow per-row failures. Worst case: this row stays
      // unmatched and the user Categorises it manually. Don't tank
      // the entire import batch on one rule misfire.
    }
  }
}

