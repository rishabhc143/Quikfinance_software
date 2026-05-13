-- ACCT-A.2 — Manual Journals Zoho-parity (header fields + Save as Draft +
-- Reverse Journal Date).
--
-- Six additive columns on ManualJournal. Existing rows default to
-- PUBLISHED + ACCRUAL_AND_CASH to match their pre-PR semantics. Safe
-- to re-apply via instrumentation.ts auto-migrate.

ALTER TABLE "ManualJournal" ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT;
ALTER TABLE "ManualJournal" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE "ManualJournal" ADD COLUMN IF NOT EXISTS "reportingMethod" TEXT NOT NULL DEFAULT 'ACCRUAL_AND_CASH';
ALTER TABLE "ManualJournal" ADD COLUMN IF NOT EXISTS "currency" TEXT;
ALTER TABLE "ManualJournal" ADD COLUMN IF NOT EXISTS "reverseJournalDate" DATE;
ALTER TABLE "ManualJournal" ADD COLUMN IF NOT EXISTS "publishReverseOnlyOnDate" BOOLEAN NOT NULL DEFAULT false;

-- Status filter is the new hot lookup on the list page.
CREATE INDEX IF NOT EXISTS "ManualJournal_org_status_idx"
  ON "ManualJournal"("organizationId", "status");
