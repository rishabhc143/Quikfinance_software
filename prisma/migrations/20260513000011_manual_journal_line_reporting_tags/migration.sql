-- ACCT-A.3.b.2 — Per-line Reporting Tags on Manual Journals.
--
-- Adds two many-to-many join tables that connect line rows to
-- existing `ReportingTag` rows. Two tables (one for each line
-- source) keep cascade behaviour clean: when a MJ or JE is
-- deleted, only its own tag links go.
--
-- Why a real FK to `ReportingTag` (not via `reportingTagOptionId`
-- like ContactReportingTag / QuoteReportingTag)? The options
-- model is still deferred and those tables carry an unverified
-- string column. Going direct here means clean FKs, real ON
-- DELETE cascades, and no orphaned ids. When the options model
-- lands, that's a separate refactor across all of them.
--
-- Idempotent — safe to re-apply via instrumentation.ts auto-migrate.

-- ──────────────────── ManualJournalLineReportingTag ────────────────────

CREATE TABLE IF NOT EXISTS "ManualJournalLineReportingTag" (
  "id"                  TEXT PRIMARY KEY,
  "manualJournalLineId" TEXT NOT NULL,
  "reportingTagId"      TEXT NOT NULL,
  CONSTRAINT "ManualJournalLineReportingTag_lineId_fkey"
    FOREIGN KEY ("manualJournalLineId") REFERENCES "ManualJournalLine"("id") ON DELETE CASCADE,
  CONSTRAINT "ManualJournalLineReportingTag_tagId_fkey"
    FOREIGN KEY ("reportingTagId") REFERENCES "ReportingTag"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MJLRT_line_tag_unique"
  ON "ManualJournalLineReportingTag"("manualJournalLineId", "reportingTagId");
CREATE INDEX IF NOT EXISTS "MJLRT_tag_idx"
  ON "ManualJournalLineReportingTag"("reportingTagId");

-- ──────────────────── JournalEntryLineReportingTag ────────────────────

CREATE TABLE IF NOT EXISTS "JournalEntryLineReportingTag" (
  "id"                 TEXT PRIMARY KEY,
  "journalEntryLineId" TEXT NOT NULL,
  "reportingTagId"     TEXT NOT NULL,
  CONSTRAINT "JournalEntryLineReportingTag_lineId_fkey"
    FOREIGN KEY ("journalEntryLineId") REFERENCES "JournalEntryLine"("id") ON DELETE CASCADE,
  CONSTRAINT "JournalEntryLineReportingTag_tagId_fkey"
    FOREIGN KEY ("reportingTagId") REFERENCES "ReportingTag"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "JELRT_line_tag_unique"
  ON "JournalEntryLineReportingTag"("journalEntryLineId", "reportingTagId");
CREATE INDEX IF NOT EXISTS "JELRT_tag_idx"
  ON "JournalEntryLineReportingTag"("reportingTagId");
