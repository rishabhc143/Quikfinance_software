import "server-only";

/**
 * CF-2 — Per-customer / per-vendor payment-delay learning.
 *
 * Reads historical invoice→PaymentReceivedAllocation→PaymentReceived
 * chains (and the equivalent for bills→PaymentMade) over the last 365
 * days and computes, per contact, the average number of days between
 * the document's `dueDate` and the actual payment date.
 *
 * The forecast engine (`forecast.ts`) shifts each projected inflow /
 * outflow by this learned delay so the projection reflects how the
 * counterparty actually pays — not how they're contractually supposed
 * to. This is what turns a deterministic projection into a credible
 * predictive one.
 *
 * Minimum sample size = 3 paid documents per contact. Below that we
 * return null and the engine falls back to the raw due date. This
 * prevents wild swings from one-off outliers.
 *
 * Performance:
 *   • Two SQL queries per call (one for AR, one for AP).
 *   • Aggregation done in memory using a Map.
 *   • Designed to run on every forecast page load. For an org with
 *     500 customers + 500 vendors over 12 months of allocations,
 *     each query returns a few thousand rows. Caching layer is a
 *     Phase 2 follow-up if this ever becomes hot.
 *
 * Caveats / intentional omissions for this v1:
 *   • Equal-weighted average — doesn't decay older payments. A
 *     customer who paid late 11 months ago + on-time recently is
 *     averaged identically. Phase 2: exponential weighting.
 *   • No distribution (P10/P50/P90) — only a point estimate.
 *     Phase 2: store percentiles for confidence bands.
 *   • No vendor / project / amount segmentation. Phase 2.
 *   • Trimming: cap individual delay observations at ±180 days so
 *     a single mis-keyed payment date can't dominate the average.
 */

import { db } from "@/lib/db";

export type PaymentDelayPattern = {
  contactId: string;
  /** Positive = pays late; negative = pays early. Rounded to whole days. */
  avgDelayDays: number;
  /** Number of paid documents that contributed to the average. */
  sampleSize: number;
};

/** Look back this far when computing the average. Older payments
 *  are less indicative of current behaviour. */
const LOOKBACK_DAYS = 365;

/** Minimum sample size before we trust the average enough to apply
 *  it. Below this, the engine ignores the pattern and uses raw dueDate. */
const MIN_SAMPLE_SIZE = 3;

/** Outliers beyond this (in either direction) are clamped before
 *  averaging. Defends against mis-keyed payment dates polluting the
 *  signal — a payment received 5 years after due is almost certainly
 *  a data-entry error or a write-off, not a typical pattern. */
const MAX_DELAY_DAYS = 180;

const oneDayMs = 24 * 60 * 60 * 1000;

/**
 * Compute the average payment delay per customer over the last
 * LOOKBACK_DAYS days. Returns a Map keyed by contactId so the engine
 * can look up O(1).
 */
export async function getCustomerPaymentDelays(
  organizationId: string,
  now: Date = new Date()
): Promise<Map<string, PaymentDelayPattern>> {
  const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * oneDayMs);

  const allocations = await db.paymentReceivedAllocation.findMany({
    where: {
      paymentReceived: {
        organizationId,
        paymentDate: { gte: cutoff },
        deletedAt: null,
      },
      invoice: {
        organizationId,
        deletedAt: null,
      },
    },
    select: {
      invoice: { select: { contactId: true, dueDate: true } },
      paymentReceived: { select: { paymentDate: true } },
    },
  });

  return aggregateDelays(
    allocations.map((a) => ({
      contactId: a.invoice.contactId,
      dueDate: a.invoice.dueDate,
      paymentDate: a.paymentReceived.paymentDate,
    }))
  );
}

/**
 * Same shape as the customer version, for vendor (AP) payments.
 * Used to shift projected outflow dates by how late we actually
 * pay the vendor — a vendor we always pay 5 days early shifts the
 * outflow earlier, freeing up days later in the projection.
 */
export async function getVendorPaymentDelays(
  organizationId: string,
  now: Date = new Date()
): Promise<Map<string, PaymentDelayPattern>> {
  const cutoff = new Date(now.getTime() - LOOKBACK_DAYS * oneDayMs);

  const allocations = await db.paymentMadeAllocation.findMany({
    where: {
      paymentMade: {
        organizationId,
        paymentDate: { gte: cutoff },
        deletedAt: null,
      },
      bill: {
        organizationId,
        deletedAt: null,
      },
    },
    select: {
      bill: { select: { contactId: true, dueDate: true } },
      paymentMade: { select: { paymentDate: true } },
    },
  });

  return aggregateDelays(
    allocations.map((a) => ({
      contactId: a.bill.contactId,
      dueDate: a.bill.dueDate,
      paymentDate: a.paymentMade.paymentDate,
    }))
  );
}

/**
 * Pure aggregation helper — extracted from the DB-bound variants so
 * the math can be unit-tested without a database. Exported for tests.
 */
export function aggregateDelays(
  observations: Array<{ contactId: string; dueDate: Date; paymentDate: Date }>
): Map<string, PaymentDelayPattern> {
  type Acc = { sumDelays: number; count: number };
  const acc = new Map<string, Acc>();

  for (const o of observations) {
    const rawDelay = Math.round(
      (o.paymentDate.getTime() - o.dueDate.getTime()) / oneDayMs
    );
    // Clamp outliers (data-entry errors, write-offs masquerading as
    // payments, etc.) before averaging.
    const clamped = Math.max(-MAX_DELAY_DAYS, Math.min(MAX_DELAY_DAYS, rawDelay));
    const cur = acc.get(o.contactId) ?? { sumDelays: 0, count: 0 };
    cur.sumDelays += clamped;
    cur.count += 1;
    acc.set(o.contactId, cur);
  }

  const result = new Map<string, PaymentDelayPattern>();
  for (const [contactId, { sumDelays, count }] of acc) {
    if (count < MIN_SAMPLE_SIZE) continue;
    result.set(contactId, {
      contactId,
      avgDelayDays: Math.round(sumDelays / count),
      sampleSize: count,
    });
  }
  return result;
}
