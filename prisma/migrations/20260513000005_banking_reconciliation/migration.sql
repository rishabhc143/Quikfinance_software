-- BNK-F: Reconciliation
--
-- One new table + two columns on BankTransaction. A reconciliation
-- proves that the sum of cleared transactions in a period equals the
-- statement closing balance the user typed in from their bank.
--
-- States:
--   IN_PROGRESS — actively being worked on (only one per account)
--   FINALISED   — locked; cleared txns can't be unmatched
--   UNDONE      — reversed; row kept for audit history
--
-- Idempotent (safe to re-apply via instrumentation.ts auto-migrate).

CREATE TABLE IF NOT EXISTS "Reconciliation" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "bankAccountId"  TEXT NOT NULL,
  "startDate"      DATE NOT NULL,
  "endDate"        DATE NOT NULL,
  "openingBalance" DECIMAL(18, 4) NOT NULL,
  "closingBalance" DECIMAL(18, 4) NOT NULL,
  "status"         TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"    TEXT NOT NULL,
  "finalisedAt"    TIMESTAMP(3),
  "finalisedById"  TEXT,
  CONSTRAINT "Reconciliation_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "Reconciliation_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE,
  CONSTRAINT "Reconciliation_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT,
  CONSTRAINT "Reconciliation_finalisedById_fkey"
    FOREIGN KEY ("finalisedById") REFERENCES "User"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "Reconciliation_account_created_idx"
  ON "Reconciliation"("bankAccountId", "createdAt" DESC);

-- Hard guard: only one IN_PROGRESS reconciliation per account.
CREATE UNIQUE INDEX IF NOT EXISTS "Reconciliation_one_in_progress_per_account"
  ON "Reconciliation"("bankAccountId")
  WHERE "status" = 'IN_PROGRESS';

-- BankTransaction: which reconciliation cleared this row and when.
-- The existing isReconciled boolean stays — these two new columns
-- tell you WHICH reconciliation did it.
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "reconciliationId" TEXT;
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "reconciledAt"     TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_reconciliationId_fkey"
    FOREIGN KEY ("reconciliationId") REFERENCES "Reconciliation"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
