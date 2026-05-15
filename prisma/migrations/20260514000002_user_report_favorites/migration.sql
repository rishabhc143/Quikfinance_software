-- REPORTS-CENTER — Per-user favorite report keys, scoped to an org.
--
-- Powers the ☆ star toggle in the Reports Center sidebar (Favorites
-- tab) introduced with the Zoho-parity rebuild of /reports.
--
-- `reportKey` is the catalog key from `lib/reports/catalog.ts`
-- (e.g. "profit-and-loss", "sales-by-customer"). It's a free-form
-- string so adding a new report later doesn't require a migration.
--
-- One row per (user, org, reportKey) — unique index enforces. Drop
-- on user / organization delete.
--
-- Idempotent — safe to re-apply via instrumentation.ts auto-migrate.

CREATE TABLE IF NOT EXISTS "UserReportFavorite" (
  "id"              TEXT PRIMARY KEY,
  "userId"          TEXT NOT NULL,
  "organizationId"  TEXT NOT NULL,
  "reportKey"       TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserReportFavorite_user_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE,
  CONSTRAINT "UserReportFavorite_org_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserReportFavorite_user_org_key_unique"
  ON "UserReportFavorite"("userId", "organizationId", "reportKey");

CREATE INDEX IF NOT EXISTS "UserReportFavorite_user_org_idx"
  ON "UserReportFavorite"("userId", "organizationId");
