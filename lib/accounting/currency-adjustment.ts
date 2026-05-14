/**
 * ACCT-C — Pure helpers for Currency Adjustments.
 *
 * v1 model: the accountant computes their forex exposure externally
 * (typically from a report run in their currency-of-interest) and
 * enters one line per affected account with the gain/loss amount
 * in **org-default currency**. Each line auto-balances against
 * either SYS-FX-GAIN (Other Income) or SYS-FX-LOSS (Other Expense):
 *
 *   GAIN line  → DR <account>  CR SYS-FX-GAIN
 *   LOSS line  → DR SYS-FX-LOSS  CR <account>
 *
 * Net effect: the account's value grows on a gain (asset re-marked
 * up) and shrinks on a loss (liability adjusted), with the contra
 * landing on the P&L.
 *
 * Lives in lib/ (not under "use server") so it's unit-testable.
 */

export type CurrencyAdjustmentKind = "GAIN" | "LOSS";

export type CurrencyAdjustmentInputLine = {
  accountId: string;
  kind: CurrencyAdjustmentKind;
  /** Positive number in org-default currency. */
  amount: number;
  description: string | null;
};

/** Build the structured reference key for the posting JE. */
export function currencyAdjustmentReference(id: string): string {
  return `CADJ:${id}`;
}

/**
 * Validator — returns null on success or a short human-readable
 * message. Rules:
 *   - At least one line.
 *   - Every amount > 0 (gains/losses are absolute values; the kind
 *     carries the sign).
 *   - Each line's accountId is non-empty.
 *
 * NOT validated here (caller's job):
 *   - Account ownership (cross-tenant check).
 *   - The chosen account isn't itself SYS-FX-GAIN / SYS-FX-LOSS
 *     (which would create a useless self-offsetting line).
 */
export function validateCurrencyAdjustmentLines(
  lines: CurrencyAdjustmentInputLine[]
): string | null {
  if (lines.length === 0) return "Add at least one adjustment line.";
  for (const l of lines) {
    if (!l.accountId) return "Pick an account on every line.";
    if (!(l.amount > 0)) {
      return "Every amount must be positive (kind = Gain or Loss).";
    }
    if (l.kind !== "GAIN" && l.kind !== "LOSS") {
      return `Unknown adjustment kind "${l.kind}".`;
    }
  }
  return null;
}

/**
 * The two JE-line shapes generated from one adjustment input line.
 *
 * Returned as a flat list of {accountId, debit, credit, description}
 * tuples ready to feed into Prisma's `lines.create`. The caller
 * provides the two system-account ids; we keep this file pure
 * (no DB lookups).
 */
export type GeneratedJeLine = {
  accountId: string;
  debit: number;
  credit: number;
  description: string | null;
};

export function buildJeLines(
  lines: CurrencyAdjustmentInputLine[],
  systemAccounts: { fxGainId: string; fxLossId: string }
): GeneratedJeLine[] {
  const out: GeneratedJeLine[] = [];
  for (const l of lines) {
    if (l.kind === "GAIN") {
      // Asset / liability re-marked up: DR the account, CR the gain.
      out.push({
        accountId: l.accountId,
        debit: l.amount,
        credit: 0,
        description: l.description,
      });
      out.push({
        accountId: systemAccounts.fxGainId,
        debit: 0,
        credit: l.amount,
        description: l.description,
      });
    } else {
      // Loss: CR the account, DR the loss.
      out.push({
        accountId: systemAccounts.fxLossId,
        debit: l.amount,
        credit: 0,
        description: l.description,
      });
      out.push({
        accountId: l.accountId,
        debit: 0,
        credit: l.amount,
        description: l.description,
      });
    }
  }
  return out;
}

/**
 * Sum gains and losses for a quick header summary on the detail
 * page. Returns absolute totals; net = gains − losses.
 */
export function summariseCurrencyAdjustment(
  lines: CurrencyAdjustmentInputLine[]
): { totalGain: number; totalLoss: number; net: number } {
  let totalGain = 0;
  let totalLoss = 0;
  for (const l of lines) {
    if (l.kind === "GAIN") totalGain += l.amount;
    else totalLoss += l.amount;
  }
  return { totalGain, totalLoss, net: totalGain - totalLoss };
}
