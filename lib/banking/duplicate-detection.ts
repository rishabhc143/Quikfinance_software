/**
 * BNK-A — Duplicate detection for imported bank transactions.
 *
 * Per the documented behaviour: a transaction is a duplicate when it
 * matches an existing row on the quadruple (accountId, date, amount,
 * reference). The match-key fudge-factor:
 *   - date  → same calendar day (ignore time-of-day)
 *   - amount → exact match to 4 decimal places (Decimal column shape)
 *   - reference → case-insensitive trimmed equality; empty reference
 *     means we can't dedup confidently (return false rather than
 *     accidentally suppress legitimate same-day same-amount transactions
 *     like Friday rent)
 *
 * Duplicates are still INSERTED into BankTransaction with `excluded=true`
 * and a reason, so:
 *   - Undo Last Import can find the rows to delete
 *   - User can manually un-exclude if our heuristic was wrong
 *   - Audit trail is preserved
 */

import type { Prisma } from "@prisma/client";

type Candidate = {
  date: Date;
  amount: number;
  reference: string | null;
};

type Existing = {
  id: string;
  date: Date;
  amount: Prisma.Decimal | number;
  reference: string | null;
};

function startOfDay(d: Date): number {
  // Use UTC so the "same calendar day" check is timezone-independent.
  // Bank-statement dates are date-only (no time component) — comparing
  // local-time would surface false negatives when the server runs in a
  // different timezone than the user (e.g. UTC server, IST user).
  const x = new Date(d);
  return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
}

function normRef(ref: string | null | undefined): string {
  return (ref ?? "").trim().toLowerCase();
}

/**
 * Return the id of an existing transaction that duplicates `candidate`,
 * or null if none. The `existing` array is the per-account history we
 * compare against — caller should fetch this once before looping over
 * a batch (don't query per-row).
 *
 * Returns null for rows with empty references; we can't safely dedup
 * "Salary 50000" against "Salary 50000" on the same day if neither has
 * a reference (could legitimately be two different salary credits).
 */
export function findDuplicate(
  candidate: Candidate,
  existing: Existing[]
): string | null {
  const cRef = normRef(candidate.reference);
  if (!cRef) return null; // no reference → can't dedup confidently

  const cDay = startOfDay(candidate.date);
  const cAmount = Number(candidate.amount);

  for (const e of existing) {
    if (startOfDay(e.date) !== cDay) continue;
    if (Math.abs(Number(e.amount) - cAmount) > 0.0001) continue;
    if (normRef(e.reference) !== cRef) continue;
    return e.id;
  }
  return null;
}

/**
 * Annotate a batch of candidates with their duplicate status. Mutates +
 * returns the input array for ergonomics. Each item gains:
 *   - duplicateOfId: string | null
 *   - duplicateReason: string | null
 */
export function markDuplicates<T extends Candidate>(
  candidates: T[],
  existing: Existing[]
): (T & { duplicateOfId: string | null; duplicateReason: string | null })[] {
  return candidates.map((c) => {
    const dupId = findDuplicate(c, existing);
    return {
      ...c,
      duplicateOfId: dupId,
      duplicateReason: dupId ? `duplicate of TXN-${dupId.slice(-6)}` : null,
    };
  });
}
