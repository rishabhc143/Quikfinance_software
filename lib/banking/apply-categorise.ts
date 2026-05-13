import "server-only";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import { getOrCreateBankGLAccount } from "@/lib/banking/bank-gl-account";
import {
  categorisedRecordType,
  validateGLForDirection,
  type BankLineDirection,
} from "@/lib/banking/categorise";
import type { AccountType, BankTransaction, ChartOfAccount } from "@prisma/client";

/**
 * BNK-E — Shared Categorise core.
 *
 * Pre-authed worker that both BNK-D (`categoriseAction`, user-driven)
 * and BNK-E (`importBankStatementAction` rule auto-fire) call. The
 * caller has already verified the org and resolved the user/rule
 * context — this function just does the per-row work:
 *
 *   1. Validate GL-account ↔ bank-line direction compatibility
 *   2. Money Out → create Expense  | Money In → create JournalEntry
 *   3. Stamp the BankTransaction (matchedRecord*, matchAutoCreated=true,
 *      optional appliedRuleId)
 *   4. Bump rule fire stats if a rule fired
 *   5. Write the audit log
 *
 * Returns the created record id. Throws on any failure — the caller
 * decides whether to swallow (rule firing on a single row) or propagate
 * (user-facing single Categorise).
 */
export async function applyCategorise(input: {
  organizationId: string;
  userId: string;
  bankTxn: Pick<
    BankTransaction,
    "id" | "bankAccountId" | "date" | "amount" | "type" | "description" | "reference"
  >;
  glAccount: Pick<ChartOfAccount, "id" | "name" | "type">;
  notes?: string | null;
  /** When set, also bumps `BankRule.timesFired` + sets `appliedRuleId`. */
  ruleId?: string | null;
}): Promise<{ recordType: "EXPENSE" | "JOURNAL_ENTRY"; recordId: string }> {
  const direction: BankLineDirection =
    input.bankTxn.type === "CREDIT" ? "CREDIT" : "DEBIT";

  // Defensive — the caller is supposed to have checked this, but a
  // double-check costs nothing and stops a misconfigured rule from
  // creating an upside-down JE.
  const directionError = validateGLForDirection(
    direction,
    input.glAccount.type as AccountType
  );
  if (directionError) {
    throw new Error(directionError);
  }

  const recordType = categorisedRecordType(direction);
  const amount = Number(input.bankTxn.amount);
  const noteText =
    input.notes?.trim() ||
    `Categorised from bank line on ${input.bankTxn.date
      .toISOString()
      .slice(0, 10)}`;

  let createdId: string;

  if (recordType === "EXPENSE") {
    const expense = await db.expense.create({
      data: {
        organizationId: input.organizationId,
        date: input.bankTxn.date,
        category: input.glAccount.name,
        expenseAccountId: input.glAccount.id,
        amount,
        reference: input.bankTxn.reference ?? null,
        notes: noteText,
        status: "RECORDED",
      },
      select: { id: true },
    });
    createdId = expense.id;
  } else {
    const bankGL = await getOrCreateBankGLAccount(input.bankTxn.bankAccountId);
    const je = await db.journalEntry.create({
      data: {
        organizationId: input.organizationId,
        date: input.bankTxn.date,
        reference: input.bankTxn.reference ?? null,
        notes: noteText,
        lines: {
          create: [
            {
              accountId: bankGL.id,
              debit: amount,
              credit: 0,
              description: input.bankTxn.description ?? null,
            },
            {
              accountId: input.glAccount.id,
              debit: 0,
              credit: amount,
              description: noteText,
            },
          ],
        },
      },
      select: { id: true },
    });
    createdId = je.id;
  }

  // Stamp the bank transaction. `appliedRuleId` only set when a rule
  // fired (BNK-E); manual Categorise (BNK-D) leaves it null.
  await db.bankTransaction.update({
    where: { id: input.bankTxn.id },
    data: {
      matchedRecordType: recordType,
      matchedRecordId: createdId,
      matchedAt: new Date(),
      matchedById: input.userId,
      matchAutoCreated: true,
      appliedRuleId: input.ruleId ?? null,
    },
  });

  if (input.ruleId) {
    await db.bankRule.update({
      where: { id: input.ruleId },
      data: {
        timesFired: { increment: 1 },
        lastFiredAt: new Date(),
      },
    });
  }

  await writeAuditLog({
    organizationId: input.organizationId,
    userId: input.userId,
    action: "CREATE",
    entityType: recordType === "EXPENSE" ? "Expense" : "JournalEntry",
    entityId: createdId,
    after: {
      categorisedFromBankTxn: input.bankTxn.id,
      glAccountId: input.glAccount.id,
      glAccountName: input.glAccount.name,
      amount,
      appliedRuleId: input.ruleId ?? null,
    },
  });

  return { recordType, recordId: createdId };
}
