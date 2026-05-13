-- ACCT-A.3.b — Per-line Contact + Project dimensions for Manual
-- Journals. Adds two nullable columns on both ManualJournalLine
-- (the human-editable source) and JournalEntryLine (the canonical
-- ledger) so they can carry-through at publish time.
--
-- Why both? Reports query JournalEntryLine. If we only annotated
-- ManualJournalLine the contact/project dimensions would never
-- reach the ledger view. So we mirror the columns on both.
--
-- Reporting Tags are deferred to ACCT-A.3.b.2 — they ride on a
-- partially-defined ReportingTagOption model that needs its own PR.
--
-- ON DELETE SET NULL: if a Contact or Project is deleted, the
-- historical journal line keeps its amount + account but drops the
-- dim, which is the audit-safe behaviour.
--
-- Idempotent — safe to re-apply via instrumentation.ts auto-migrate.

-- ──────────────────── ManualJournalLine ────────────────────

ALTER TABLE "ManualJournalLine" ADD COLUMN IF NOT EXISTS "contactId" TEXT;
ALTER TABLE "ManualJournalLine" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

DO $$ BEGIN
  ALTER TABLE "ManualJournalLine"
    ADD CONSTRAINT "ManualJournalLine_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ManualJournalLine"
    ADD CONSTRAINT "ManualJournalLine_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ManualJournalLine_contactId_idx"
  ON "ManualJournalLine"("contactId");
CREATE INDEX IF NOT EXISTS "ManualJournalLine_projectId_idx"
  ON "ManualJournalLine"("projectId");

-- ──────────────────── JournalEntryLine ────────────────────

ALTER TABLE "JournalEntryLine" ADD COLUMN IF NOT EXISTS "contactId" TEXT;
ALTER TABLE "JournalEntryLine" ADD COLUMN IF NOT EXISTS "projectId" TEXT;

DO $$ BEGIN
  ALTER TABLE "JournalEntryLine"
    ADD CONSTRAINT "JournalEntryLine_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "Contact"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "JournalEntryLine"
    ADD CONSTRAINT "JournalEntryLine_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "JournalEntryLine_contactId_idx"
  ON "JournalEntryLine"("contactId");
CREATE INDEX IF NOT EXISTS "JournalEntryLine_projectId_idx"
  ON "JournalEntryLine"("projectId");
