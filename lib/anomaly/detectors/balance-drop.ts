import "server-only";

/**
 * AD-v2 — Bank-balance drop detector.
 *
 * Fires when a bank account's CURRENT balance is more than
 * `DROP_THRESHOLD_PCT` (default 30%) below its balance a week ago,
 * AND the absolute drop exceeds `MIN_ABSOLUTE_DROP` (default
 * ₹1,00,000).
 *
 * Why this matters:
 *   - Catches surprise large withdrawals (vendor paid via wire we
 *     didn't expect, payroll ran early, etc.)
 *   - Catches unrecorded receipts that haven't been logged yet
 *     (cash position drifting from book position)
 *   - Catches cron drift — if reconciliation hasn't run in N days,
 *     book balance lags actual
 *
 * Severity:
 *   - HIGH if current balance < ₹0 (went negative)
 *   - HIGH if dropped > 60% AND absolute drop > ₹5L
 *   - MEDIUM otherwise
 *
 * Anchors on BankAccount.openingBalance + sum of BankTransaction
 * amounts (CREDIT positive, DEBIT negative). "Balance a week ago"
 * is the same calculation but only counting transactions dated
 * ≤ weekAgo.
 */

import { db } from "@/lib/db";
import type { DetectedAnomaly, DetectorFn } from "../types";
import { formatMoneyForDescription, fpKey } from "../util";

const DROP_THRESHOLD_PCT = 30;
const MIN_ABSOLUTE_DROP = 100_000;
const HIGH_SEVERITY_DROP_PCT = 60;
const HIGH_SEVERITY_ABS_DROP = 500_000;

export const detectBalanceDrop: DetectorFn = async (organizationId, today) => {
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const banks = await db.bankAccount.findMany({
    where: { organizationId, isActive: true },
    select: { id: true, name: true, openingBalance: true },
  });

  const out: DetectedAnomaly[] = [];

  for (const bank of banks) {
    // Compute current balance via single GROUP BY.
    const allTxns = await db.bankTransaction.findMany({
      where: {
        organizationId,
        bankAccountId: bank.id,
        excluded: false,
      },
      select: { amount: true, type: true, date: true },
    });

    const opening = Number(bank.openingBalance);
    let current = opening;
    let oneWeekAgoBal = opening;

    for (const txn of allTxns) {
      const amt = Math.abs(Number(txn.amount));
      const signed = txn.type === "CREDIT" ? amt : -amt;
      current += signed;
      if (txn.date <= weekAgo) oneWeekAgoBal += signed;
    }

    const drop = oneWeekAgoBal - current;
    if (drop < MIN_ABSOLUTE_DROP) continue;
    const dropPct = oneWeekAgoBal !== 0 ? (drop / Math.abs(oneWeekAgoBal)) * 100 : Infinity;
    if (dropPct < DROP_THRESHOLD_PCT) continue;

    const severity: "high" | "medium" =
      current < 0 ||
      (dropPct >= HIGH_SEVERITY_DROP_PCT && drop >= HIGH_SEVERITY_ABS_DROP)
        ? "high"
        : "medium";

    out.push({
      detectorKey: "balance_drop",
      severity,
      title: `${bank.name} balance dropped ${Math.round(dropPct)}% this week`,
      description:
        `Balance was ${formatMoneyForDescription(oneWeekAgoBal, "INR")} a week ` +
        `ago; now ${formatMoneyForDescription(current, "INR")} ` +
        `(-${formatMoneyForDescription(drop, "INR")}, -${Math.round(dropPct)}%).` +
        (current < 0
          ? ` Account is currently NEGATIVE — review imminent payments.`
          : ` Review recent debits to confirm they were all expected.`),
      refType: "bank_account",
      refId: bank.id,
      fingerprint: fpKey("balance_drop", [bank.id]),
    });
  }

  return out;
};
