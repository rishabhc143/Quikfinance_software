-- DOC-D2.1: Smart Capture foundation — PDF text extraction
--
-- Adds the columns the extraction pipeline writes to. D2.1 only
-- populates `extractedText` + `documentType` + `extractedAt`;
-- `extractedFields` JSONB stays null until parsers ship in D2.2.
--
-- All ADD COLUMNs are idempotent so re-running on a partially applied
-- prod DB is safe. Index follows the same pattern as the D1.1 inbox
-- index — `documentType + deletedAt` powers the Bank Statements view.

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "extractedText" TEXT;

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "extractedFields" JSONB;

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "documentType" TEXT;

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "extractedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "Document_org_docType_deleted_idx"
  ON "Document"("organizationId", "documentType", "deletedAt");
