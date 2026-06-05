-- CF-7 / AD-1 — Anomaly Alerts
--
-- One row per detected anomaly. Detectors run nightly via cron and
-- emit / dismiss alerts based on the current state of the org's
-- ledger. Rows persist (with status transitions) so the user can
-- act on them, dismiss them, and audit them later.
--
-- Idempotent (IF NOT EXISTS) so safe to re-apply on prod cold-start.

CREATE TABLE IF NOT EXISTS "AnomalyAlert" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  -- One of the detector keys defined in lib/anomaly/detectors/.
  -- e.g. 'duplicate_bill', 'missing_recurring', 'overdue_jump'.
  "detectorKey"    TEXT NOT NULL,
  -- 'high' | 'medium' | 'low' — drives badge colour + sort order.
  "severity"       TEXT NOT NULL DEFAULT 'medium',
  -- Short headline shown in the list (e.g. "Possible duplicate bill").
  "title"          TEXT NOT NULL,
  -- Longer human-readable description with the specific details
  -- (vendor name, amount, dates, etc.).
  "description"    TEXT NOT NULL,
  -- Optional pointer back to the source row (Bill / Invoice /
  -- RecurringBill / etc.) so the UI can deep-link.
  "refType"        TEXT,
  "refId"          TEXT,
  -- 'open' | 'dismissed' | 'acted'. Detectors that re-fire after
  -- dismissal create a NEW row (don't resurrect dismissed ones).
  "status"         TEXT NOT NULL DEFAULT 'open',
  "dismissedAt"    TIMESTAMP(3),
  "dismissedById"  TEXT,
  -- Free-text reason the user typed when dismissing — useful for
  -- training the next-gen detector tuning.
  "dismissReason"  TEXT,
  -- A stable hash of the alert's identity (detectorKey + the data
  -- points that define it — e.g. for duplicate_bill: the two bill
  -- ids sorted). Used to suppress re-creation while the row is
  -- still open AND to detect "same anomaly re-emerged after
  -- dismissal" for future heuristics.
  "fingerprint"    TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AnomalyAlert_organizationId_fkey'
  ) THEN
    ALTER TABLE "AnomalyAlert"
      ADD CONSTRAINT "AnomalyAlert_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- Hot path: list open alerts per org. Combined with status to
-- support the dashboard widget "open count" without a row scan.
CREATE INDEX IF NOT EXISTS "AnomalyAlert_org_status_idx"
  ON "AnomalyAlert"("organizationId", "status", "createdAt" DESC);

-- Dedup guard: while a fingerprint is still OPEN we don't re-create
-- the same alert. Partial unique index keeps it cheap.
CREATE UNIQUE INDEX IF NOT EXISTS "AnomalyAlert_open_fingerprint_uniq"
  ON "AnomalyAlert"("organizationId", "fingerprint")
  WHERE "status" = 'open';
