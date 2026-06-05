/**
 * CF-7 / AD-1 — Anomaly detector shared types.
 *
 * Each detector is a pure-ish function that takes (orgId, today)
 * and returns a list of `DetectedAnomaly` candidates. The
 * orchestrator dedupes them against the existing OPEN alerts
 * (via fingerprint), inserts new ones, and leaves resolved ones
 * to age naturally (the user dismisses them in the UI; we don't
 * auto-close, because a "no longer duplicate" anomaly often
 * means someone fixed the underlying problem and the user should
 * still see that confirmation).
 */

export type AnomalySeverity = "high" | "medium" | "low";

export type DetectedAnomaly = {
  /** Stable identifier of the detector that produced this. */
  detectorKey: string;
  severity: AnomalySeverity;
  title: string;
  description: string;
  /** Deep-link back to the source row. Optional. */
  refType?: string;
  refId?: string;
  /**
   * Stable hash of the alert's identity. The orchestrator uses this
   * to detect "this exact anomaly is already OPEN" and skip
   * insertion — so a 7-night-running detector doesn't spam the
   * inbox with duplicates of the same finding.
   *
   * Convention: `${detectorKey}:${sorted-source-ids-or-keys}`.
   */
  fingerprint: string;
};

export type DetectorFn = (
  organizationId: string,
  today: Date
) => Promise<DetectedAnomaly[]>;
