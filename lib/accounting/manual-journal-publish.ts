/**
 * ACCT-A.3 — Pure helpers used by the publish flow + reverse-JE
 * posting. Lives in `lib/` (not inside the `"use server"` action
 * file) so Vitest can import without dragging in NextAuth / Prisma.
 */

/**
 * Flip DR ↔ CR on every line. Used to build the reverse JE when a
 * manual journal carries a `reverseJournalDate`.
 *
 * Returns a NEW array; does not mutate input. Preserves any extra
 * fields on the input shape (accountId, description, position, …).
 */
export function flipDrCrLines<T extends { debit: number; credit: number }>(
  lines: T[]
): T[] {
  return lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
}

/** Build the structured reference key for the primary MJ posting. */
export function manualJournalReference(manualJournalId: string): string {
  return `MJ:${manualJournalId}`;
}

/** Build the structured reference key for the reverse MJ posting. */
export function manualJournalReverseReference(manualJournalId: string): string {
  return `MJ-REV:${manualJournalId}`;
}
