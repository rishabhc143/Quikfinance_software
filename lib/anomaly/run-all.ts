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
import { detectBalanceDrop } from "./detectors/balance-drop";
import { detectDuplicateBills } from "./detectors/duplicate-bill";
import { detectGstinMismatch } from "./detectors/gstin-mismatch";
import { detectMissingRecurring } from "./detectors/missing-recurring";
import { detectOverdueJump } from "./detectors/overdue-jump";
import { detectStaleInvoiceDraft } from "./detectors/stale-invoice-draft";
import { detectUnusedRecurringProfile } from "./detectors/unused-recurring-profile";
import { detectVendorConcentration } from "./detectors/vendor-concentration";
import type { DetectedAnomaly, DetectorFn } from "./types";

/**
 * Registry of all enabled detectors. Add new ones here. Each is a
 * pure function (orgId, today) → DetectedAnomaly[].
 *
 * AD-v2 shipped 4 new detectors on top of the v1 pair:
 *   - overdue_jump: customer's outstanding rose >50% week-over-week
 *   - balance_drop: bank balance fell >30% week-over-week
 *   - vendor_concentration: >50% of payables to a single vendor
 *   - gstin_mismatch: contact GSTIN state ≠ place-of-supply state
 *
 * Future detectors lined up for v3:
 *   - period_end_gap: month-end with no JE for known accruals
 *   - large_unbilled_expense: billable expense >30 days old, no invoice
 */
const DETECTORS: DetectorFn[] = [
  // v1
  detectDuplicateBills,
  detectMissingRecurring,
  // v2 — Sprint 8 cashflow/AR/AP/compliance signals
  detectOverdueJump,
  detectBalanceDrop,
  detectVendorConcentration,
  detectGstinMismatch,
  // v3 — workflow / data-hygiene signals
  detectStaleInvoiceDraft,
  detectUnusedRecurringProfile,
];

export type AnomalyRunResult = {
  detected: number;
  inserted: number;
  skipped: number;
  /** AD-v2: NEW high-severity alerts created this run. The caller
   *  passes these to notifyHighSeverity() to push an email digest. */
  newHighSeverityIds: string[];
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

  if (all.length === 0) {
    return { detected: 0, inserted: 0, skipped: 0, newHighSeverityIds: [] };
  }

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
    return {
      detected: all.length,
      inserted: 0,
      skipped: all.length,
      newHighSeverityIds: [],
    };
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

  // AD-v2: re-fetch the newly-created HIGH-severity alerts so the
  // caller (cron route) can email them out. We query by fingerprint
  // because createMany doesn't return ids in Postgres.
  const highFingerprints = toInsert
    .filter((a) => a.severity === "high")
    .map((a) => a.fingerprint);
  const newHighRows =
    highFingerprints.length > 0
      ? await db.anomalyAlert.findMany({
          where: {
            organizationId,
            fingerprint: { in: highFingerprints },
            status: "open",
          },
          select: { id: true },
        })
      : [];

  return {
    detected: all.length,
    inserted: created.count,
    skipped: all.length - created.count,
    newHighSeverityIds: newHighRows.map((r) => r.id),
  };
}
