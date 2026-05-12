-- BNK-A: Banking CSV import + Bank/Credit Card account types + import-batch
-- tracking. Idempotent (safe to re-apply via instrumentation.ts auto-migrate).
--
-- Three changes:
--  1. BankAccount.type enum (BANK / CREDIT_CARD / PAYPAL) replaces the
--     free-text accountType column. Existing rows map: credit_card →
--     CREDIT_CARD, wallet → PAYPAL, everything else → BANK.
--  2. BankAccount.isPrimary boolean (only one BANK can be primary per org).
--  3. BankImportBatch + BankImportPreset + BankTransaction.{excluded,
--     excludedReason, importBatchId} for CSV-import undo + duplicate
--     detection. New non-unique index for fast dedup lookups.

-- ───────────────────────── 1. Account type enum ─────────────────────────

DO $$ BEGIN
  CREATE TYPE "BankAccountType" AS ENUM ('BANK', 'CREDIT_CARD', 'PAYPAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add the new `type` column nullable so we can backfill, then make NOT NULL.
ALTER TABLE "BankAccount" ADD COLUMN IF NOT EXISTS "type" "BankAccountType";

UPDATE "BankAccount" SET "type" = CASE
  WHEN "accountType" = 'credit_card' THEN 'CREDIT_CARD'::"BankAccountType"
  WHEN "accountType" = 'wallet'      THEN 'PAYPAL'::"BankAccountType"
  ELSE 'BANK'::"BankAccountType"
END
WHERE "type" IS NULL;

ALTER TABLE "BankAccount" ALTER COLUMN "type" SET NOT NULL;
ALTER TABLE "BankAccount" ALTER COLUMN "type" SET DEFAULT 'BANK';

-- Keep the old `accountType` column around as legacy free-text (deprecated
-- but not destructive — drops in a future cleanup PR once we're confident
-- nothing reads it).

-- ───────────────────────── 2. isPrimary + new optional fields ─────────────────────────

ALTER TABLE "BankAccount" ADD COLUMN IF NOT EXISTS "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- Optional bank-identification fields from the Zoho Add Bank or Credit Card
-- form (Screenshots 3 + 4). All nullable so existing rows stay valid.
ALTER TABLE "BankAccount" ADD COLUMN IF NOT EXISTS "bankName"    TEXT;
ALTER TABLE "BankAccount" ADD COLUMN IF NOT EXISTS "ifsc"        TEXT;
ALTER TABLE "BankAccount" ADD COLUMN IF NOT EXISTS "description" TEXT;

-- Partial unique index: at most one primary BANK per org.
DROP INDEX IF EXISTS "BankAccount_org_primary_unique";
CREATE UNIQUE INDEX "BankAccount_org_primary_unique"
  ON "BankAccount"("organizationId")
  WHERE "isPrimary" = true AND "type" = 'BANK';

-- ───────────────────────── 3. Import batches + presets ─────────────────────────

CREATE TABLE IF NOT EXISTS "BankImportBatch" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "bankAccountId"  TEXT NOT NULL,
  "uploadedById"   TEXT NOT NULL,
  "fileName"       TEXT NOT NULL,
  "rowCount"       INTEGER NOT NULL,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankImportBatch_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "BankImportBatch_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE,
  CONSTRAINT "BankImportBatch_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "BankImportBatch_account_created_idx"
  ON "BankImportBatch"("bankAccountId", "createdAt" DESC);

CREATE TABLE IF NOT EXISTS "BankImportPreset" (
  "id"               TEXT PRIMARY KEY,
  "organizationId"   TEXT NOT NULL,
  "bankAccountId"    TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "amountColumnType" TEXT NOT NULL,                       -- 'DOUBLE' | 'SINGLE_WITH_TYPE' | 'SINGLE_NEGATIVE'
  "encoding"         TEXT NOT NULL DEFAULT 'utf-8',
  "delimiter"        TEXT NOT NULL DEFAULT ',',
  "columnMapJson"    JSONB NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankImportPreset_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "BankImportPreset_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "BankImportPreset_account_name_unique"
  ON "BankImportPreset"("bankAccountId", "name");

-- ───────────────────────── 4. BankTransaction additions ─────────────────────────

ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "excluded"        BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "excludedReason"  TEXT;
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "importBatchId"   TEXT;

DO $$ BEGIN
  ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_importBatchId_fkey"
    FOREIGN KEY ("importBatchId") REFERENCES "BankImportBatch"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Duplicate-detection index: (accountId, date, amount, reference) per the
-- documented Zoho dedup quadruple.
CREATE INDEX IF NOT EXISTS "BankTransaction_dedup_idx"
  ON "BankTransaction"("bankAccountId", "date", "amount", "reference");
