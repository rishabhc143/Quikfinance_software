/**
 * BNK-C — Candidate scoring for bank-line ↔ Quikfinance-record matching.
 *
 * For each unmatched BankTransaction the user picks one record from:
 *   - Invoice            (Sales — outstanding customer payments to receive)
 *   - Bill               (Purchases — outstanding vendor payments to make)
 *   - PaymentReceived    (already-recorded customer payment, for re-matching)
 *   - PaymentMade        (already-recorded vendor payment, for re-matching)
 *   - Expense            (standalone expense line)
 *
 * Scoring rubric (0–100, higher = better):
 *
 *   +60   Amount matches exactly (4-decimal-place tolerance)
 *   +40   Amount matches within 1% (e.g. payment-gateway fee delta)
 *   +20   Amount matches within 5%
 *
 *   +20   Same calendar day (UTC)
 *   +15   Within 3 days
 *   +10   Within 7 days
 *   +5    Within 30 days
 *
 *   +10   Bank line description contains the counterparty's display name
 *
 *   Direction filter: a Money In bank line (CREDIT) only matches records
 *   that represent money coming in (Invoice / PaymentReceived). A Money
 *   Out line (DEBIT) only matches money-out records (Bill / PaymentMade /
 *   Expense). Direction mismatch → candidate filtered out entirely, not
 *   just scored low.
 *
 * Cutoff: candidates scoring below 30 are dropped. Top 10 returned, sorted
 * by score descending.
 */

export type CandidateRecordType =
  | "INVOICE"
  | "BILL"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_MADE"
  | "EXPENSE";

export type Candidate = {
  type: CandidateRecordType;
  id: string;
  /** Short, user-recognizable identifier — e.g. "INV-2026-0042". */
  number: string;
  /** Vendor / customer display name; null for standalone records. */
  counterparty: string | null;
  amount: number;
  date: Date;
  status?: string;
};

export type BankLine = {
  amount: number;
  date: Date;
  /** "CREDIT" = Money In; "DEBIT" = Money Out. */
  type: "CREDIT" | "DEBIT";
  description: string | null;
};

/** Money-direction by record type. Used to filter candidates. */
const RECORD_DIRECTION: Record<CandidateRecordType, "IN" | "OUT"> = {
  INVOICE: "IN",
  PAYMENT_RECEIVED: "IN",
  BILL: "OUT",
  PAYMENT_MADE: "OUT",
  EXPENSE: "OUT",
};

function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function scoreAmount(bankAmount: number, candAmount: number): number {
  const a = Math.abs(bankAmount);
  const b = Math.abs(candAmount);
  if (Math.abs(a - b) <= 0.0001) return 60; // exact (with 4-decimal tolerance)
  if (b === 0) return 0;
  const pctDiff = Math.abs(a - b) / b;
  if (pctDiff <= 0.01) return 40;
  if (pctDiff <= 0.05) return 20;
  return 0;
}

function scoreDate(bankDate: Date, candDate: Date): number {
  const dayDiff =
    Math.abs(utcDay(bankDate) - utcDay(candDate)) / (24 * 60 * 60 * 1000);
  if (dayDiff === 0) return 20;
  if (dayDiff <= 3) return 15;
  if (dayDiff <= 7) return 10;
  if (dayDiff <= 30) return 5;
  return 0;
}

function scoreDescription(
  bankDescription: string | null,
  counterparty: string | null
): number {
  if (!bankDescription || !counterparty) return 0;
  const desc = bankDescription.toLowerCase();
  const cp = counterparty.toLowerCase().trim();
  if (!cp) return 0;
  // Whole-name contains
  if (desc.includes(cp)) return 10;
  // Last-word fallback: many bank descriptions truncate the front of a
  // company name ("ACME CORP" → "ACME"). Try matching just the first
  // word if it's long enough to be meaningful.
  const firstWord = cp.split(/\s+/)[0];
  if (firstWord && firstWord.length >= 4 && desc.includes(firstWord)) return 5;
  return 0;
}

/** Score one candidate against the bank line. Returns 0-100. */
export function scoreCandidate(
  bankLine: BankLine,
  candidate: Candidate
): number {
  // Direction filter — candidate must be moving money in the same direction
  // as the bank line. CREDIT bank line wants money-in records; DEBIT wants
  // money-out. Mismatch returns -1 so the caller can drop it.
  const wantDirection: "IN" | "OUT" =
    bankLine.type === "CREDIT" ? "IN" : "OUT";
  if (RECORD_DIRECTION[candidate.type] !== wantDirection) return -1;

  return (
    scoreAmount(bankLine.amount, candidate.amount) +
    scoreDate(bankLine.date, candidate.date) +
    scoreDescription(bankLine.description, candidate.counterparty)
  );
}

/**
 * Score + sort + cap a candidate list. Drops anything below the cutoff
 * score (30 by default — chosen so amount-only matches still surface but
 * "same-day, slightly-off-amount" doesn't dominate when there's a real
 * exact-amount candidate nearby).
 */
export function rankCandidates(
  bankLine: BankLine,
  candidates: Candidate[],
  opts: { cutoff?: number; limit?: number } = {}
): (Candidate & { score: number })[] {
  const cutoff = opts.cutoff ?? 30;
  const limit = opts.limit ?? 10;
  return candidates
    .map((c) => ({ ...c, score: scoreCandidate(bankLine, c) }))
    .filter((c) => c.score >= cutoff)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
