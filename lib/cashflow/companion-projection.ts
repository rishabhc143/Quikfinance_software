import "server-only";

/**
 * Tally Companion Sprint 2 — project CompanionVoucher rows into the
 * cashflow forecast.
 *
 * Why a separate file: keeps `forecast.ts` focused on the native
 * Invoice/Bill projection, while this module owns the Companion
 * assumptions (net-30 payment, age cutoff, type → direction mapping)
 * that may evolve as we ship more Tally voucher types.
 *
 * v1 ASSUMPTIONS (sprint 2):
 *
 *   1. **Net-30 payment**: a sales voucher dated 2026-05-01 projects
 *      as an inflow on 2026-05-31. A purchase voucher projects as an
 *      outflow on date+30. We don't import Receipt/Payment vouchers
 *      yet (Sprint 3 work), so we have no way to know what's actually
 *      been paid. Net-30 is the Indian SMB norm and slightly more
 *      conservative than reality (most actually pay 45-60 days).
 *
 *   2. **90-day age cutoff**: vouchers older than 90 days from `today`
 *      are skipped. The assumption is they've been paid already even
 *      though we haven't imported the receipt evidence. Without this
 *      cutoff, a customer who imported 5 years of Tally history would
 *      see every historical invoice projected as future income, which
 *      is wildly wrong.
 *
 *   3. **Past-due lands on day 0**: a sales voucher whose net-30 date
 *      is already in the past (e.g. issued 45 days ago) projects on
 *      forecast start (today). Same convention as native Invoice
 *      projection in forecast.ts.
 *
 *   4. **No payment-delay learning**: CF-2's per-customer delay
 *      patterns DON'T apply to Companion data — we don't know the
 *      customer ids consistently between Companion and native, and
 *      Tally data may include customers the user doesn't have
 *      historical Quikfinance payment data for. Pure due-date
 *      projection.
 *
 *   5. **No stress-test layering**: CF-3 stress doesn't apply for the
 *      same reason — these are imported "ground truth" vouchers, not
 *      projections we'd add hypothetical delay to.
 *
 * When Sprint 3 ships Receipt + Payment voucher imports, this module
 * will pair them with sales/purchase vouchers to compute remaining
 * unpaid balance and only project that delta. The 90-day cutoff
 * becomes unnecessary at that point.
 */

import { addDays, startOfDay } from "date-fns";
import { db } from "@/lib/db";
import type { ForecastItem } from "./types";

const NET_PAYMENT_DAYS = 30;
const MAX_AGE_DAYS = 90;

export type CompanionProjection = {
  date: Date;
  item: ForecastItem;
  /** "in" = sales-voucher inflow, "out" = purchase-voucher outflow. */
  direction: "in" | "out";
};

/** Pull CompanionVoucher rows for the org + project them into
 *  ForecastItem placements. Returns the count separately so the
 *  forecast engine can report it in the summary (transparency:
 *  "your forecast includes N items from Tally"). */
export async function projectCompanionVouchers(
  organizationId: string,
  start: Date,
  end: Date
): Promise<{ projections: CompanionProjection[]; total: number }> {
  // Exclude vouchers older than the cutoff — they've probably been
  // paid even if we don't have receipt evidence yet (Sprint 3 fixes
  // that). Without this, importing 5 years of Tally history would
  // generate thousands of phantom future inflows.
  const cutoff = new Date(start.getTime() - MAX_AGE_DAYS * 86400000);

  // Sprint 4 — two queries:
  //   1. Within-cutoff rows: include regardless of paid status, so a
  //      fully-paid recent voucher correctly drops out via the
  //      total-paidAmount check in the loop below.
  //   2. Older rows with OUTSTANDING balance: included even though
  //      they're past the age cutoff, because they still represent
  //      real unpaid money the user is owed (or owes).
  // We can't combine these into one query because Prisma can't
  // compare two columns in a `where`. The partial index from Sprint 4
  // (`CompanionVoucher_party_type_date_idx`) keeps both queries fast.
  const [withinCutoff, olderRows] = await Promise.all([
    db.companionVoucher.findMany({
      where: {
        organizationId,
        deletedAt: null,
        type: { in: ["sales", "purchase"] },
        OR: [{ date: { gte: cutoff } }],
      },
      select: {
        id: true,
        sourceVoucherNumber: true,
        type: true,
        date: true,
        total: true,
        paidAmount: true,
        partyLedger: { select: { displayName: true } },
      },
    }),
    db.companionVoucher.findMany({
      where: {
        organizationId,
        deletedAt: null,
        type: { in: ["sales", "purchase"] },
        date: { lt: cutoff },
      },
      select: {
        id: true,
        sourceVoucherNumber: true,
        type: true,
        date: true,
        total: true,
        paidAmount: true,
        partyLedger: { select: { displayName: true } },
      },
    }),
  ]);

  // Defensive copy via spread — guards against the test mock
  // returning the same array reference for both findMany calls
  // (which used to mutate the iterated list when we pushed into
  // it). Production Prisma returns fresh arrays so this is a
  // test-only safety net.
  const vouchers = [...withinCutoff];
  for (const o of olderRows) {
    if (Number(o.total) - Number(o.paidAmount) > 0.005) vouchers.push(o);
  }

  const out: CompanionProjection[] = [];
  for (const v of vouchers) {
    // Sprint 4 — project the UNPAID balance, not the full total.
    // When the matcher has fully cleared a voucher, this becomes 0
    // and the voucher contributes nothing to the forecast.
    const total = Number(v.total);
    const paid = Number(v.paidAmount);
    const amount = total - paid;
    if (amount <= 0) continue;
    const projectionDate = startOfDay(addDays(v.date, NET_PAYMENT_DAYS));
    const effDate = projectionDate < start ? start : projectionDate;
    // Past the horizon? Skip — the engine's day-grid won't have a
    // bucket for it.
    if (effDate > end) continue;

    const partyName = v.partyLedger?.displayName ?? "(unmapped party)";
    const isSales = v.type === "sales";

    out.push({
      date: effDate,
      direction: isSales ? "in" : "out",
      item: {
        source: isSales ? "companion-sales" : "companion-purchase",
        refId: v.id,
        label: `${isSales ? "Tally invoice" : "Tally bill"} ${v.sourceVoucherNumber} — ${partyName}`,
        amount,
      },
    });
  }

  return { projections: out, total: out.length };
}
