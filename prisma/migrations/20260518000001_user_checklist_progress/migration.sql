-- GETTING-STARTED — Per-user checklist completion state.
-- Powers the "Mark as Completed" link on the Getting Started page
-- (and any future onboarding-style checklists).
--
-- One row per (user, organization, itemKey). itemKey is free-form
-- ("add-organisation-details", "create-first-invoice", etc.) so
-- adding new items doesn't need a migration. FK cascade at SQL
-- level only — same lightweight pattern as UserReportFavorite.

CREATE TABLE IF NOT EXISTS "UserChecklistProgress" (
  "id"             TEXT NOT NULL PRIMARY KEY,
  "userId"         TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "itemKey"        TEXT NOT NULL,
  "completedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserChecklistProgress_user_org_key_unique"
  ON "UserChecklistProgress" ("userId", "organizationId", "itemKey");
CREATE INDEX IF NOT EXISTS "UserChecklistProgress_user_org_idx"
  ON "UserChecklistProgress" ("userId", "organizationId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserChecklistProgress_userId_fkey'
  ) THEN
    ALTER TABLE "UserChecklistProgress"
      ADD CONSTRAINT "UserChecklistProgress_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserChecklistProgress_organizationId_fkey'
  ) THEN
    ALTER TABLE "UserChecklistProgress"
      ADD CONSTRAINT "UserChecklistProgress_organizationId_fkey"
        FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE;
  END IF;
END $$;
