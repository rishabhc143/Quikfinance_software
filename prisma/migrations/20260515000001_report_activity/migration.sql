-- REPORTS — Per-report activity audit log.
-- Captures every "PDF generated", "XLSX downloaded", "Schedule created",
-- "Report customized", "Printed" event scoped to (organization, report).
-- Powers the Report Activity drawer (the timeline that opens when a
-- user clicks the activity icon on a report toolbar).
--
-- Free-form eventType + eventData JSON so adding new event kinds in
-- later PRs (Schedule from Phase B, custom-report saves, etc.) does
-- NOT require another migration. Idempotent: only creates if missing.

CREATE TABLE IF NOT EXISTS "ReportActivity" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "reportKey"      TEXT NOT NULL,
  "eventType"      TEXT NOT NULL,
  "eventData"      JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Lookup by (org, report) ordered newest-first is the hot query
-- (the drawer's "last N activities for this report" view).
CREATE INDEX IF NOT EXISTS "ReportActivity_org_report_createdAt_idx"
  ON "ReportActivity" ("organizationId", "reportKey", "createdAt" DESC);

-- Per-user audit view ("everything I did on reports this month")
-- may be useful later but isn't strictly needed now; cheap to add.
CREATE INDEX IF NOT EXISTS "ReportActivity_user_createdAt_idx"
  ON "ReportActivity" ("userId", "createdAt" DESC);

-- Foreign keys at SQL level only (mirrors UserReportFavorite's pattern;
-- keeps the User + Organization Prisma models unchanged).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ReportActivity_userId_fkey'
  ) THEN
    ALTER TABLE "ReportActivity"
      ADD CONSTRAINT "ReportActivity_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ReportActivity_organizationId_fkey'
  ) THEN
    ALTER TABLE "ReportActivity"
      ADD CONSTRAINT "ReportActivity_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
END $$;
