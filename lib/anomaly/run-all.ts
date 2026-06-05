import "server-only";

/**
 * CF-7 — Orchestrate all anomaly detectors for one organization.
 *
 * Runs each registered detector in parallel, dedupes against the
 * existing OPEN alerts (via fingerprint), and inserts new rows.
 * Returns counts for cron logging + test assertions.
 *
 * Existing open alerts that the detectors no longer emit are LEFT
 * ALONE rather than auto-resolved. Rationale: the user dismissed
 * them or not — auto-resolving could hide that the underlying
 * issue was fixed (which the user still wants to confirm by
 * clicking through).
 */

import { db } from "@/lib/db";
import { detectDuplicateBills } from "./detectors/duplicate-bill";
import { detectMissingRecurring } from "./detectors/missing-recurring";
import type { DetectedAnomaly, DetectorFn } from "./types";

/**
 * Registry of all enabled detectors. Add new ones here. Each is a
 * pure function (orgId, today) → DetectedAnomaly[].
 *
 * Future detectors I have lined up but not yet shipped:
 *   - overdue_jump: customer's outstanding rose > 50% week-over-week
 *   - balance_drop: bank account balance fell > 30% week-over-week
 *   - vendor_concentration: > 50% of payables to a single vendor
 *   - gstin_mismatch: vendor GST doesn't match place-of-supply
 *   - period_end_gap: month-end with no JE for known accruals
 *   - large_unbilled_expense: billable expense > 30 days old, no invoice
 */
const DETECTORS: DetectorFn[] = [
  detectDuplicateBills,
  detectMissingRecurring,
];

export type AnomalyRunResult = {
  detected: number;
  inserted: number;
  skipped: number;
};

export async function runAnomalyDetectors(
  organizationId: string,
  today: Date = new Date()
): Promise<AnomalyRunResult> {
  // Run every detector in parallel. Each throws are caught
  // individually so a single broken detector doesn't kill the
  // whole pass — important for cron stability.
  const results = await Promise.allSettled(
    DETECTORS.map((d) => d(organizationId, today))
  );

  const all: DetectedAnomaly[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
    else console.error("[anomaly] detector failed:", r.reason);
  }

  if (all.length === 0) return { detected: 0, inserted: 0, skipped: 0 };

  // Look up existing OPEN fingerprints in this org so we can dedupe.
  const existing = await db.anomalyAlert.findMany({
    where: {
      organizationId,
      status: "open",
      fingerprint: { in: all.map((a) => a.fingerprint) },
    },
    select: { fingerprint: true },
  });
  const existingFps = new Set(existing.map((e) => e.fingerprint));

  const toInsert = all.filter((a) => !existingFps.has(a.fingerprint));
  if (toInsert.length === 0) {
    return { detected: all.length, inserted: 0, skipped: all.length };
  }

  // `createMany` + `skipDuplicates` is belt-and-braces: even if a
  // parallel cron run somewhere inserted the same fingerprint
  // between our findMany and the createMany, the partial unique
  // index swallows the conflict instead of erroring the whole
  // batch.
  const created = await db.anomalyAlert.createMany({
    data: toInsert.map((a) => ({
      organizationId,
      detectorKey: a.detectorKey,
      severity: a.severity,
      title: a.title,
      description: a.description,
      refType: a.refType ?? null,
      refId: a.refId ?? null,
      fingerprint: a.fingerprint,
    })),
    skipDuplicates: true,
  });

  return {
    detected: all.length,
    inserted: created.count,
    skipped: all.length - created.count,
  };
}
