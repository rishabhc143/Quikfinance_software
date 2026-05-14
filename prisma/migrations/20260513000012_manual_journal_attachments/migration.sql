-- ACCT-A.3.c — Attachments on Manual Journals.
--
-- Mirrors CreditNoteAttachment 1:1 (same columns, same cascade
-- behaviour). Limits (5 files × 10 MB) live in the Zod schema +
-- the shared <AttachFilesField> component, not the DB.
--
-- Storage: data-URL strings stored inline in `fileUrl` for v1,
-- matching every other Quikfinance attachment table. A real blob
-- backend lands when /api/upload's production stub gets wired up.
--
-- Idempotent — safe to re-apply via instrumentation.ts auto-migrate.

CREATE TABLE IF NOT EXISTS "ManualJournalAttachment" (
  "id"              TEXT PRIMARY KEY,
  "manualJournalId" TEXT NOT NULL,
  "fileName"        TEXT NOT NULL,
  "fileUrl"         TEXT NOT NULL,
  "fileSize"        INTEGER NOT NULL,
  "mimeType"        TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ManualJournalAttachment_manualJournalId_fkey"
    FOREIGN KEY ("manualJournalId") REFERENCES "ManualJournal"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ManualJournalAttachment_manualJournalId_idx"
  ON "ManualJournalAttachment"("manualJournalId");
