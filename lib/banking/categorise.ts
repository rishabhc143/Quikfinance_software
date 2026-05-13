import type { AccountType } from "@prisma/client";

/**
 * BNK-D — Pure helpers for the Categorise (no-match fallback) flow.
 *
 * Categorise = when no Quikfinance record matches a bank line, the user
 * picks a GL account and we create the backing record on the fly:
 *
 *   Money Out (DEBIT)  → Expense       — single row in the Expense table,
 *                                         points at the chosen expenseAccountId
 *   Money In  (CREDIT) → JournalEntry  — 2-line entry, Bank GL DR + chosen
 *                                         Income/OtherIncome CR
 *
 * These helpers are pure (no DB) so they're trivially unit-testable. The
 * server action calls them to validate the user's GL pick BEFORE writing
 * anything.
 */

export type BankLineDirection = "CREDIT" | "DEBIT";

export type CategoriseRecordType = "EXPENSE" | "JOURNAL_ENTRY";

/**
 * Acceptable Chart-of-Accounts types for each bank-line direction.
 * Money Out can land in EXPENSE or COST_OF_GOODS_SOLD (some businesses
 * record direct purchases there) — both keep the books sane. Money In
 * lands in INCOME or OTHER_INCOME.
 */
export const VALID_ACCOUNT_TYPES: Record<BankLineDirection, AccountType[]> = {
  DEBIT: ["EXPENSE", "COST_OF_GOODS_SOLD"],
  CREDIT: ["INCOME", "OTHER_INCOME"],
};

/** Maps a bank-line direction to the record type Categorise will create. */
export function categorisedRecordType(
  direction: BankLineDirection
): CategoriseRecordType {
  return direction === "DEBIT" ? "EXPENSE" : "JOURNAL_ENTRY";
}

/**
 * Validates a GL-account pick against a bank-line direction. Returns a
 * short error message if the pairing is invalid, null otherwise.
 *
 * - DEBIT line + INCOME account  → "Pick an expense account for Money Out"
 * - CREDIT line + EXPENSE account → "Pick an income account for Money In"
 */
export function validateGLForDirection(
  direction: BankLineDirection,
  accountType: AccountType
): string | null {
  const allowed = VALID_ACCOUNT_TYPES[direction];
  if (allowed.includes(accountType)) return null;
  return direction === "DEBIT"
    ? "Pick an expense account (Expense or Cost of Goods Sold) for Money Out lines."
    : "Pick an income account (Income or Other Income) for Money In lines.";
}

/**
 * Asserts every bank line in a bulk operation shares the same direction.
 * Returns the common direction on success, or an error message on mixed
 * input. Empty array → error (caller should have caught this).
 */
export function assertSameDirection(
  lines: { type: BankLineDirection }[]
): { direction: BankLineDirection } | { error: string } {
  if (lines.length === 0) return { error: "No bank lines selected." };
  const first = lines[0].type;
  const mixed = lines.some((l) => l.type !== first);
  if (mixed) {
    return {
      error: "Bulk Categorise requires all selected rows to be the same direction (all Money In or all Money Out).",
    };
  }
  return { direction: first };
}
