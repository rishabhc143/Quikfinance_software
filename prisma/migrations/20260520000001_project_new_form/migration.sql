-- Project form rebuild to match Zoho's New Project layout.
-- All additive + idempotent so older deploys keep working.

-- Project: 5 new columns
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "projectCode" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "billingMethod" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "revenueBudget" DECIMAL(18, 4);
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "watchedByUserIds" TEXT[] NOT NULL DEFAULT '{}';

-- Task: billable flag + sortOrder for inline-form ordering
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "billable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- ProjectUser join table: which org members are assigned to which project.
CREATE TABLE IF NOT EXISTS "ProjectUser" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectUser_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectUser_projectId_userId_key"
  ON "ProjectUser" ("projectId", "userId");

CREATE INDEX IF NOT EXISTS "ProjectUser_organizationId_idx"
  ON "ProjectUser" ("organizationId");

-- FK constraints — wrapped in DO blocks for idempotency.
DO $$ BEGIN
  ALTER TABLE "ProjectUser"
    ADD CONSTRAINT "ProjectUser_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectUser"
    ADD CONSTRAINT "ProjectUser_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ProjectUser"
    ADD CONSTRAINT "ProjectUser_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
