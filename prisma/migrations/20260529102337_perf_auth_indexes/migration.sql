-- Perf: index hot auth lookup columns so `requireOrganization()` (called on
-- every dashboard page nav via lib/auth-helpers.ts) doesn't sequential-scan.
-- Idempotent so it's safe to apply repeatedly via /api/admin/migrate.

CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "OrganizationMembership_userId_idx" ON "OrganizationMembership"("userId");
