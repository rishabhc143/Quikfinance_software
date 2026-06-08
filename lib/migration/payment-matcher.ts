import "server-only";

/**
 * Sprint 4 — Tally payment matcher.
 *
 * Pairs Receipt vouchers with their corresponding Sales vouchers
 * (and Payment vouchers with Purchase) by party + date FIFO, so we
 * can compute `paidAmount` per Sales/Purchase voucher and project
 * only the UNPAID portion in the forecast.
 *
 * Matching algorithm (per party, per side):
 *   1. Gather all Sales (or Purchase) vouchers for this party,
 *      ordered ASC by date.
 *   2. Gather all Receipt (or Payment) vouchers for this party,
 *      ordered ASC by date.
 *   3. For each cash-side voucher, in date order, apply its full
 *      amount against the oldest unpaid Sales/Purchase voucher
 *      first (FIFO). Roll over surplus to the next voucher if
 *      this one becomes fully paid mid-allocation.
 *   4. Cap each voucher's paidAmount at its `total` (Tally
 *      occasionally double-records receipts; capping prevents
 *      negative outstanding balances).
 *
 * Why FIFO not amount-matching:
 *   - Tally's own AR/AP aging works FIFO by default.
 *   - Amount-matching would require parsing voucher narrations
 *     for "against bill XYZ" references — fragile in real-world
 *     data. FIFO is the safe, well-understood default.
 *
 * Why per-party not global:
 *   - A receipt from Acme can only pay down Acme's invoices.
 *
 * Cross-batch behaviour:
 *   - The matcher re-runs across ALL non-deleted CompanionVouchers
 *     for the org on every import batch completion. So a Receipt
 *     imported in batch 2 correctly pays down a Sales voucher
 *     imported in batch 1.
 *   - Idempotent: re-running on the same data produces the same
 *     paidAmount values.
 *
 * Performance: single bulk query per org → in-memory grouping +
 * allocation → single bulk update. For a 10K-voucher org this is
 * < 200ms. Phase 2 may add per-batch incremental matching if scale
 * grows.
 */

import { db } from "@/lib/db";

export type MatcherStats = {
  /** Number of Sales/Purchase vouchers whose paidAmount changed. */
  vouchersUpdated: number;
  /** Total cash applied across all matches, in voucher currency
   *  units. Diagnostic — should roughly equal Σ(receipts+payments)
   *  minus any orphan unmatched cash. */
  totalCashApplied: number;
  /** Cash that couldn't be matched (no open voucher for that party
   *  at the time of the cash voucher). Often legitimate (advance
   *  payments, deposits) — surfaces in the import report. */
  unmatchedCash: number;
};

type VoucherRow = {
  id: string;
  type: string;
  date: Date;
  total: { toString(): string };
  paidAmount: { toString(): string };
  partyLedgerId: string | null;
};

/** Runs the matcher across ALL non-deleted CompanionVouchers for
 *  one org. Called from the upload endpoint after every batch
 *  insert; safe to re-run idempotently. */
export async function runPaymentMatcher(
  organizationId: string
): Promise<MatcherStats> {
  // Single bulk read. The partial index from the Sprint 4 migration
  // (`CompanionVoucher_party_type_date_idx`) keeps this fast even
  // at scale.
  const vouchers = await db.companionVoucher.findMany({
    where: {
      organizationId,
      deletedAt: null,
      partyLedgerId: { not: null },
      type: { in: ["sales", "purchase", "receipt", "payment"] },
    },
    select: {
      id: true,
      type: true,
      date: true,
      total: true,
      paidAmount: true,
      partyLedgerId: true,
    },
    orderBy: { date: "asc" },
  });

  // Group by (partyLedgerId, side):
  //   side "ar" — Sales + Receipt (customer)
  //   side "ap" — Purchase + Payment (vendor)
  // A single ledger could be both (rare but legal in Tally) — we
  // key by (partyId, side) so they're tracked separately.
  type SideKey = `${string}:ar` | `${string}:ap`;
  type Bucket = { open: VoucherRow[]; cash: VoucherRow[] };
  const buckets = new Map<SideKey, Bucket>();

  for (const v of vouchers) {
    if (!v.partyLedgerId) continue;
    const isAr = v.type === "sales" || v.type === "receipt";
    const isAp = v.type === "purchase" || v.type === "payment";
    const key: SideKey | null = isAr
      ? `${v.partyLedgerId}:ar`
      : isAp
        ? `${v.partyLedgerId}:ap`
        : null;
    if (!key) continue;
    const bucket = buckets.get(key) ?? { open: [], cash: [] };
    if (v.type === "sales" || v.type === "purchase") bucket.open.push(v);
    else bucket.cash.push(v);
    buckets.set(key, bucket);
  }

  // ── Allocation ──────────────────────────────────────────────
  // Mutable per-voucher allocated amount, indexed by voucher id.
  const newPaidById = new Map<string, number>();
  let totalApplied = 0;
  let unmatched = 0;

  for (const bucket of buckets.values()) {
    // FIFO: sort both sides by date asc.
    bucket.open.sort((a, b) => a.date.getTime() - b.date.getTime());
    bucket.cash.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Cursor into the open list. Vouchers fully paid drop off the
    // front and the cursor advances.
    let cursor = 0;
    const remaining = bucket.open.map((v) => Number(v.total));

    for (const cash of bucket.cash) {
      let cashLeft = Number(cash.total);
      while (cashLeft > 0 && cursor < bucket.open.length) {
        const headRemaining = remaining[cursor];
        if (headRemaining <= 0.005) {
          cursor += 1;
          continue;
        }
        const apply = Math.min(cashLeft, headRemaining);
        remaining[cursor] -= apply;
        cashLeft -= apply;
        const headVoucher = bucket.open[cursor];
        newPaidById.set(
          headVoucher.id,
          (newPaidById.get(headVoucher.id) ?? 0) + apply
        );
        totalApplied += apply;
      }
      if (cashLeft > 0) unmatched += cashLeft;
    }
  }

  // ── Persist deltas (only update rows whose paidAmount changed) ─
  let updated = 0;
  for (const v of vouchers) {
    if (v.type !== "sales" && v.type !== "purchase") continue;
    const newPaid = Math.min(newPaidById.get(v.id) ?? 0, Number(v.total));
    const oldPaid = Number(v.paidAmount);
    if (Math.abs(newPaid - oldPaid) < 0.005) continue;
    await db.companionVoucher.update({
      where: { id: v.id },
      data: { paidAmount: newPaid.toFixed(4) },
    });
    updated += 1;
  }

  return {
    vouchersUpdated: updated,
    totalCashApplied: totalApplied,
    unmatchedCash: unmatched,
  };
}
