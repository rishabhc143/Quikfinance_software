-- Tally Companion v1 — shadow tables for read-only Tally data.
--
-- Sprint 1 design constraints:
--   1. Idempotent. Re-running the migration is a no-op (CREATE TABLE
--      IF NOT EXISTS, ADD CONSTRAINT via DO-block IF NOT EXISTS).
--   2. Strictly additive. No changes to native Quikfinance tables.
--   3. Soft-deletable per Companion batch — we rollback an import by
--      flipping MigrationBatch.status='rolled_back' + setting
--      deletedAt on the child rows.

-- ── MigrationBatch ──────────────────────────────────────────────
-- Groups every Companion row by import session. Powers:
--   • Progress + status UI ("import in progress 38%")
--   • Rollback ("undo this import" — soft-deletes children)
--   • Audit trail per CA / per period
CREATE TABLE IF NOT EXISTS "MigrationBatch" (
  "id"                TEXT PRIMARY KEY,
  "organizationId"    TEXT NOT NULL,
  "userId"            TEXT NOT NULL,
  -- "tally-prime" | "tally-erp9" | "tally-9" | "zoho-xml" | "qb-qbo"
  "sourceFormat"      TEXT NOT NULL,
  -- Original filename for the audit log + history list.
  "sourceFilename"    TEXT NOT NULL,
  -- File size in bytes — surfaced in the UI to set expectations
  -- ("Importing 12.4 MB...").
  "sourceFilesizeB"   INTEGER NOT NULL DEFAULT 0,
  -- "queued" | "running" | "done" | "failed" | "rolled_back"
  "status"            TEXT NOT NULL DEFAULT 'queued',
  -- Number of items expected (post-parse, pre-commit). Used by the
  -- progress UI to compute a percentage.
  "totalLedgers"      INTEGER NOT NULL DEFAULT 0,
  "totalVouchers"     INTEGER NOT NULL DEFAULT 0,
  -- Number actually inserted (running tally during import).
  "insertedLedgers"   INTEGER NOT NULL DEFAULT 0,
  "insertedVouchers"  INTEGER NOT NULL DEFAULT 0,
  -- Number rejected during validation (e.g. malformed lines).
  "skippedLedgers"    INTEGER NOT NULL DEFAULT 0,
  "skippedVouchers"   INTEGER NOT NULL DEFAULT 0,
  -- JSONB of ParseWarning[] — surfaces parser warnings to the user
  -- in the post-import report.
  "warnings"          JSONB,
  -- If the import failed, the error message.
  "error"             TEXT,
  -- 30-day rollback window. Set when status flips to 'done'.
  -- After this expires the "Undo this import" button hides.
  "rollbackExpiresAt" TIMESTAMP(3),
  "startedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"       TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MigrationBatch_organizationId_fkey'
  ) THEN
    ALTER TABLE "MigrationBatch"
      ADD CONSTRAINT "MigrationBatch_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

-- Recent imports for an org (history page query).
CREATE INDEX IF NOT EXISTS "MigrationBatch_org_createdAt_idx"
  ON "MigrationBatch"("organizationId", "createdAt" DESC);

-- ── CompanionLedger ─────────────────────────────────────────────
-- Customer / vendor / account rows imported from Tally. Mirrors
-- the canonical Ledger shape — we deliberately don't co-mingle
-- with the native Contact table so re-mapping + rollback are
-- safe.
CREATE TABLE IF NOT EXISTS "CompanionLedger" (
  "id"                 TEXT PRIMARY KEY,
  "organizationId"     TEXT NOT NULL,
  "migrationBatchId"   TEXT NOT NULL,
  "sourceFormat"       TEXT NOT NULL,
  -- Stable identifier from Tally — drives idempotent re-import.
  "sourceGuid"         TEXT NOT NULL,
  -- "customer" | "vendor" | "bank" | "income" | "expense" | "asset"
  -- | "liability" | "tax" | "other"
  "kind"               TEXT NOT NULL,
  "displayName"        TEXT NOT NULL,
  "groupPath"          TEXT,
  -- GSTIN if present — primary dedup key against native Contact
  -- table when (in Phase 2) the user promotes Companion data to
  -- native.
  "gstin"              TEXT,
  "stateCode"          TEXT,
  "address"            TEXT,
  "phone"              TEXT,
  "email"              TEXT,
  -- Decimal(18,4) matches the native Quikfinance money precision.
  "openingBalance"     DECIMAL(18,4),
  "openingBalanceAsOf" TIMESTAMP(3),
  -- Full source payload for debugging + forward-compat. JSONB
  -- because we want to query it in support investigations.
  "raw"                JSONB,
  -- Soft-delete via rollback.
  "deletedAt"          TIMESTAMP(3),
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CompanionLedger_organizationId_fkey'
  ) THEN
    ALTER TABLE "CompanionLedger"
      ADD CONSTRAINT "CompanionLedger_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CompanionLedger_migrationBatchId_fkey'
  ) THEN
    ALTER TABLE "CompanionLedger"
      ADD CONSTRAINT "CompanionLedger_migrationBatchId_fkey"
      FOREIGN KEY ("migrationBatchId") REFERENCES "MigrationBatch"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

-- Idempotency: re-importing the same Tally XML must merge, not
-- duplicate. (orgId, sourceFormat, sourceGuid) is unique among
-- LIVE rows. We allow multiple soft-deleted rows so a rollback +
-- re-import doesn't collide.
CREATE UNIQUE INDEX IF NOT EXISTS "CompanionLedger_org_source_guid_unique"
  ON "CompanionLedger"("organizationId", "sourceFormat", "sourceGuid")
  WHERE "deletedAt" IS NULL;

-- List queries scoped to a batch ("show me everything imported by
-- batch X").
CREATE INDEX IF NOT EXISTS "CompanionLedger_batch_idx"
  ON "CompanionLedger"("migrationBatchId");

-- GSTIN lookup for Phase-2 promote-to-native flow.
CREATE INDEX IF NOT EXISTS "CompanionLedger_org_gstin_idx"
  ON "CompanionLedger"("organizationId", "gstin")
  WHERE "deletedAt" IS NULL;

-- Filter by kind for type-specific list pages ("show all
-- imported customers").
CREATE INDEX IF NOT EXISTS "CompanionLedger_org_kind_idx"
  ON "CompanionLedger"("organizationId", "kind")
  WHERE "deletedAt" IS NULL;

-- ── CompanionVoucher ────────────────────────────────────────────
-- Sales / Purchase / Receipt / Payment / etc. Lines are stored
-- inline as JSON because:
--   • Tally line structure is highly variable (qty/rate/amount
--     sometimes implicit, sometimes explicit, with per-line GST
--     splits).
--   • Companion is read-only; we don't query individual lines for
--     business logic, only aggregate totals.
--   • Simplifies schema — one table instead of two; rollback is
--     a single soft-delete.
CREATE TABLE IF NOT EXISTS "CompanionVoucher" (
  "id"                    TEXT PRIMARY KEY,
  "organizationId"        TEXT NOT NULL,
  "migrationBatchId"      TEXT NOT NULL,
  "sourceFormat"          TEXT NOT NULL,
  "sourceGuid"            TEXT NOT NULL,
  -- Tally voucher number preserved verbatim ("INV/2024-25/001").
  "sourceVoucherNumber"   TEXT NOT NULL,
  -- "sales" | "purchase" | "receipt" | "payment" | "journal"
  -- | "credit_note" | "debit_note" | "contra"
  "type"                  TEXT NOT NULL,
  "date"                  TIMESTAMP(3) NOT NULL,
  -- Link to a CompanionLedger (the party) when known. Nullable for
  -- vouchers without a single party (journals, contras).
  "partyLedgerId"         TEXT,
  -- Place of supply (state name) — drives IGST vs CGST+SGST.
  "placeOfSupply"         TEXT,
  "narration"             TEXT,
  "currency"              TEXT,
  -- Pre-computed totals from the source. Decimal(18,4) for INR.
  "subtotal"              DECIMAL(18,4) NOT NULL DEFAULT 0,
  "tax"                   DECIMAL(18,4) NOT NULL DEFAULT 0,
  "total"                 DECIMAL(18,4) NOT NULL DEFAULT 0,
  -- Lines as JSONB. Shape mirrors CanonicalLine.
  "lines"                 JSONB NOT NULL,
  -- Full source payload.
  "raw"                   JSONB,
  "deletedAt"             TIMESTAMP(3),
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CompanionVoucher_organizationId_fkey'
  ) THEN
    ALTER TABLE "CompanionVoucher"
      ADD CONSTRAINT "CompanionVoucher_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CompanionVoucher_migrationBatchId_fkey'
  ) THEN
    ALTER TABLE "CompanionVoucher"
      ADD CONSTRAINT "CompanionVoucher_migrationBatchId_fkey"
      FOREIGN KEY ("migrationBatchId") REFERENCES "MigrationBatch"("id")
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'CompanionVoucher_partyLedgerId_fkey'
  ) THEN
    ALTER TABLE "CompanionVoucher"
      ADD CONSTRAINT "CompanionVoucher_partyLedgerId_fkey"
      FOREIGN KEY ("partyLedgerId") REFERENCES "CompanionLedger"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

-- Same idempotency rule as ledgers.
CREATE UNIQUE INDEX IF NOT EXISTS "CompanionVoucher_org_source_guid_unique"
  ON "CompanionVoucher"("organizationId", "sourceFormat", "sourceGuid")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "CompanionVoucher_batch_idx"
  ON "CompanionVoucher"("migrationBatchId");

-- Date-range queries for "show me all Sales from FY 2024-25".
CREATE INDEX IF NOT EXISTS "CompanionVoucher_org_type_date_idx"
  ON "CompanionVoucher"("organizationId", "type", "date" DESC)
  WHERE "deletedAt" IS NULL;

-- Per-party drilldown ("show me all invoices for Acme Corp").
CREATE INDEX IF NOT EXISTS "CompanionVoucher_party_idx"
  ON "CompanionVoucher"("partyLedgerId")
  WHERE "partyLedgerId" IS NOT NULL AND "deletedAt" IS NULL;
