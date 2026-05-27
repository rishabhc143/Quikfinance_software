-- REPORTS — Saved custom report views, scoped to a (user, org).
--
-- One row per "Save as Custom Report" action from a report toolbar.
-- `reportKey` is the catalog key from `lib/reports/catalog.ts`
-- (e.g. "profit-and-loss"); `params` is the report page's
-- `exportParams` URL query string, stored verbatim so reopening the
-- saved view restores its filters/columns. Surfaced under the
-- "My Reports" tab on /reports.
--
-- One row per (user, org, name) — unique index enforces. FK cascade
-- on user / organization delete.
--
-- Idempotent — safe to re-apply via instrumentation.ts auto-migrate.

CREATE TABLE IF NOT EXISTS "CustomReport" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reportKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "params" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomReport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomReport_userId_organizationId_name_key" ON "CustomReport"("userId", "organizationId", "name");
CREATE INDEX IF NOT EXISTS "CustomReport_organizationId_reportKey_idx" ON "CustomReport"("organizationId", "reportKey");
CREATE INDEX IF NOT EXISTS "CustomReport_userId_organizationId_idx" ON "CustomReport"("userId", "organizationId");
