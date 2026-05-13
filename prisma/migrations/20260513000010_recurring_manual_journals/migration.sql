-- ACCT-A.4.c — Recurring Manual Journals.
--
-- New `RecurringManualJournal` table mirrors `RecurringBill`'s
-- shape so the cron + form patterns stay consistent across the
-- codebase. Generated MJs land in DRAFT (same as RecurringBill →
-- DRAFT bill) so the accountant reviews before posting to the ledger.
--
-- A new nullable `recurringManualJournalId` on `ManualJournal`
-- traces each generated journal back to its source profile + does
-- double duty as the date-bucket idempotency key for the cron.
--
-- Idempotent — safe to re-apply via instrumentation.ts auto-migrate.

-- ──────────────────── RecurringManualJournal ────────────────────

CREATE TABLE IF NOT EXISTS "RecurringManualJournal" (
  "id"                  TEXT PRIMARY KEY,
  "organizationId"      TEXT NOT NULL,
  "profileName"         TEXT NOT NULL,
  "frequency"           TEXT NOT NULL,
  "intervalN"           INTEGER NOT NULL DEFAULT 1,
  "startDate"           TIMESTAMP NOT NULL,
  "endDate"             TIMESTAMP,
  "neverExpires"        BOOLEAN NOT NULL DEFAULT false,
  "nextOccurrenceDate"  TIMESTAMP NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'ACTIVE',
  "isActive"            BOOLEAN NOT NULL DEFAULT true,
  "occurrencesGenerated" INTEGER NOT NULL DEFAULT 0,
  "templateJson"        JSONB,
  "createdAt"           TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMP NOT NULL DEFAULT NOW(),
  "deletedAt"           TIMESTAMP,
  CONSTRAINT "RecurringManualJournal_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "RecurringManualJournal_org_status_next_idx"
  ON "RecurringManualJournal"("organizationId", "status", "nextOccurrenceDate");
CREATE INDEX IF NOT EXISTS "RecurringManualJournal_deletedAt_idx"
  ON "RecurringManualJournal"("deletedAt");

-- ──────────────────── ManualJournal back-ref ────────────────────

ALTER TABLE "ManualJournal" ADD COLUMN IF NOT EXISTS "recurringManualJournalId" TEXT;

DO $$ BEGIN
  ALTER TABLE "ManualJournal"
    ADD CONSTRAINT "ManualJournal_recurringManualJournalId_fkey"
    FOREIGN KEY ("recurringManualJournalId") REFERENCES "RecurringManualJournal"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ManualJournal_recurringManualJournalId_idx"
  ON "ManualJournal"("recurringManualJournalId");
