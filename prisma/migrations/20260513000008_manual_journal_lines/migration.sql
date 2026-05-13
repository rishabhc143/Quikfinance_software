-- ACCT-A.3 — Line storage for Manual Journals so DRAFTs can be saved
-- and re-edited before posting to the ledger.
--
-- New ManualJournalLine table cascades from its parent header
-- (`ManualJournal`). At publish time the action duplicates these
-- lines into JournalEntryLine under the MJ:<id> / MJ-REV:<id> JEs so
-- the canonical ledger query path stays unchanged. Reports still
-- read from JournalEntryLine.
--
-- Idempotent — safe to re-apply via instrumentation.ts auto-migrate.

CREATE TABLE IF NOT EXISTS "ManualJournalLine" (
  "id"              TEXT PRIMARY KEY,
  "manualJournalId" TEXT NOT NULL,
  "position"        INTEGER NOT NULL DEFAULT 0,
  "accountId"       TEXT NOT NULL,
  "debit"           DECIMAL(18, 4) NOT NULL DEFAULT 0,
  "credit"          DECIMAL(18, 4) NOT NULL DEFAULT 0,
  "description"     TEXT,
  CONSTRAINT "ManualJournalLine_manualJournalId_fkey"
    FOREIGN KEY ("manualJournalId") REFERENCES "ManualJournal"("id") ON DELETE CASCADE,
  CONSTRAINT "ManualJournalLine_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "ManualJournalLine_manualJournalId_idx"
  ON "ManualJournalLine"("manualJournalId");
