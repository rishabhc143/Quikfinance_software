-- BNK-C: Match Transactions — link a bank line to one existing Quikfinance
-- record (Invoice / Bill / PaymentReceived / PaymentMade / Expense).
-- v1 uses flat columns on BankTransaction for single-record match. BNK-D
-- will introduce a join table when multi-match (one bank line = multiple
-- invoices + a fee adjustment) becomes needed.
--
-- Idempotent (safe to re-apply via instrumentation.ts auto-migrate).

ALTER TABLE "BankTransaction"
  ADD COLUMN IF NOT EXISTS "matchedRecordType" TEXT,
  ADD COLUMN IF NOT EXISTS "matchedRecordId"   TEXT,
  ADD COLUMN IF NOT EXISTS "matchedAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "matchedById"       TEXT;

DO $$ BEGIN
  ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_matchedById_fkey"
    FOREIGN KEY ("matchedById") REFERENCES "User"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Index for "show me unmatched transactions" filters on the per-account
-- match page.
CREATE INDEX IF NOT EXISTS "BankTransaction_unmatched_idx"
  ON "BankTransaction"("bankAccountId", "date" DESC)
  WHERE "matchedRecordType" IS NULL AND "excluded" = false;
