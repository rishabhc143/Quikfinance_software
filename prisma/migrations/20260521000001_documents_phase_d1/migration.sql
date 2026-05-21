-- DOC-D1: Documents module Phase D1 schema
--
-- Adds the structural foundation for the rebuilt /documents page:
--   * DocumentFolder (recursive parent/child via parentFolderId, mirrors
--     ChartOfAccount.parentId pattern)
--   * Document.folderId, .inbox, .fileHash, .associatedEntityType,
--     .associatedEntityId, .deletedAt
--
-- All ADDs are idempotent (IF NOT EXISTS) so re-running on a partially
-- applied prod DB is safe. No data is moved — the legacy string column
-- `Document.folder` is kept for back-compat; new uploads will start
-- writing to `folderId` once D1.2 ships the folder UI.

-- ───────────────────── DocumentFolder ─────────────────────
CREATE TABLE IF NOT EXISTS "DocumentFolder" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "parentFolderId" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "DocumentFolder_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "DocumentFolder"
    ADD CONSTRAINT "DocumentFolder_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentFolder"
    ADD CONSTRAINT "DocumentFolder_parentFolderId_fkey"
    FOREIGN KEY ("parentFolderId") REFERENCES "DocumentFolder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "DocumentFolder_org_parent_deleted_idx"
  ON "DocumentFolder"("organizationId", "parentFolderId", "deletedAt");

-- ───────────────────── Document extensions ─────────────────────
ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "folderId" TEXT;

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "inbox" TEXT;

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "fileHash" TEXT;

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "associatedEntityType" TEXT;

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "associatedEntityId" TEXT;

ALTER TABLE "Document"
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "Document"
    ADD CONSTRAINT "Document_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "DocumentFolder"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Document_org_folder_deleted_idx"
  ON "Document"("organizationId", "folderId", "deletedAt");

CREATE INDEX IF NOT EXISTS "Document_org_inbox_deleted_idx"
  ON "Document"("organizationId", "inbox", "deletedAt");

CREATE INDEX IF NOT EXISTS "Document_org_hash_idx"
  ON "Document"("organizationId", "fileHash");

CREATE INDEX IF NOT EXISTS "Document_org_entity_idx"
  ON "Document"("organizationId", "associatedEntityType", "associatedEntityId");
