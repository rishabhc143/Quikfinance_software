-- REPORTS — Recurring report email delivery.
--
-- ScheduledReport          one row per (user, org, report) schedule.
--   - frequency: DAILY | WEEKLY | MONTHLY
--   - format:    PDF | XLSX | CSV
--   - status:    ACTIVE | PAUSED
--   - recipients: comma-separated email list (validated server-side)
--   - reportParams: JSON snapshot of the customization (date preset,
--                   compare, column toggles) so each scheduled run
--                   uses the same filters the user picked at create time
--
-- ScheduledReportRun       one row per send attempt.
--   - status: SUCCESS | FAILED
--   - errorMessage: stored if the worker hit an error
--
-- Both have FK cascade at the SQL level only (same pattern as
-- ReportActivity and UserReportFavorite).

CREATE TABLE IF NOT EXISTS "ScheduledReport" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "organizationId"  TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "reportKey"       TEXT NOT NULL,
  "reportTitle"     TEXT NOT NULL,
  "frequency"       TEXT NOT NULL DEFAULT 'WEEKLY',
  "format"          TEXT NOT NULL DEFAULT 'PDF',
  "status"          TEXT NOT NULL DEFAULT 'ACTIVE',
  "startDate"       TIMESTAMP(3) NOT NULL,
  "nextSendAt"      TIMESTAMP(3) NOT NULL,
  "lastSentAt"      TIMESTAMP(3),
  "recipients"      TEXT NOT NULL,
  "reportParams"    JSONB,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ScheduledReport_org_report_idx"
  ON "ScheduledReport" ("organizationId", "reportKey");
CREATE INDEX IF NOT EXISTS "ScheduledReport_status_nextSendAt_idx"
  ON "ScheduledReport" ("status", "nextSendAt");
CREATE INDEX IF NOT EXISTS "ScheduledReport_user_idx"
  ON "ScheduledReport" ("userId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ScheduledReport_userId_fkey'
  ) THEN
    ALTER TABLE "ScheduledReport"
      ADD CONSTRAINT "ScheduledReport_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ScheduledReport_organizationId_fkey'
  ) THEN
    ALTER TABLE "ScheduledReport"
      ADD CONSTRAINT "ScheduledReport_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
END $$;

-- Send history (per scheduled run)
CREATE TABLE IF NOT EXISTS "ScheduledReportRun" (
  "id"                  TEXT NOT NULL PRIMARY KEY,
  "scheduledReportId"   TEXT NOT NULL,
  "organizationId"      TEXT NOT NULL,
  "sentAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status"              TEXT NOT NULL,
  "recipients"          TEXT NOT NULL,
  "errorMessage"        TEXT
);

CREATE INDEX IF NOT EXISTS "ScheduledReportRun_schedule_sentAt_idx"
  ON "ScheduledReportRun" ("scheduledReportId", "sentAt" DESC);
CREATE INDEX IF NOT EXISTS "ScheduledReportRun_org_sentAt_idx"
  ON "ScheduledReportRun" ("organizationId", "sentAt" DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ScheduledReportRun_scheduledReportId_fkey'
  ) THEN
    ALTER TABLE "ScheduledReportRun"
      ADD CONSTRAINT "ScheduledReportRun_scheduledReportId_fkey"
        FOREIGN KEY ("scheduledReportId") REFERENCES "ScheduledReport"("id") ON DELETE CASCADE;
  END IF;
END $$;
