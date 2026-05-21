-- DOC-D3.1: Per-org inbox email token
--
-- Adds the secure random token used as the local-part of the
-- per-org email address: <token>.secure@<INBOX_DOMAIN>.
--
-- Generated lazily on first request via getOrCreateInboxToken — we
-- don't backfill existing rows because most orgs won't enable email
-- forwarding immediately.

ALTER TABLE "Organization"
  ADD COLUMN IF NOT EXISTS "inboxEmailToken" TEXT;

-- Partial unique index: enforces uniqueness only on non-null values
-- so the column stays nullable across all existing rows.
CREATE UNIQUE INDEX IF NOT EXISTS "Organization_inboxEmailToken_key"
  ON "Organization"("inboxEmailToken")
  WHERE "inboxEmailToken" IS NOT NULL;
