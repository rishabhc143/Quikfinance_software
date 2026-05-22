-- DOC-D4.1: Password-protected PDF support
--
-- Adds a flag on Document that the upload action sets when pdfjs
-- throws PasswordException during extraction. The preview drawer
-- reads this flag and surfaces a password prompt — user enters the
-- correct password and we re-run extraction in-memory (original
-- encrypted PDF stays in Blob storage; we don't write an unlocked
-- copy).

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "needsPassword" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS "Document_org_needsPassword_idx"
  ON "Document"("organizationId", "needsPassword")
  WHERE "needsPassword" = TRUE;
