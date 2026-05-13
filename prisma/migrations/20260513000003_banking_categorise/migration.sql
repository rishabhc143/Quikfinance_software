-- BNK-D: Categorise (no-match fallback)
--
-- Adds two additive columns so the match flow can also create the
-- backing record (Expense for Money Out, JournalEntry for Money In)
-- when no existing Quikfinance record fits.
--
--  1. BankAccount.glAccountId — bridge to ChartOfAccount. Nullable +
--     populated lazily by getOrCreateBankGLAccount() on first Money In
--     Categorise. Existing rows stay valid.
--  2. BankTransaction.matchAutoCreated — flag so unmatch can also
--     delete the linked record (Expense / JournalEntry) when it was
--     created by Categorise. Manually-matched records (BNK-C) keep
--     the original behavior (`false`, default).
--
-- Idempotent — safe to re-apply via instrumentation.ts auto-migrate.

ALTER TABLE "BankAccount" ADD COLUMN IF NOT EXISTS "glAccountId" TEXT;

DO $$ BEGIN
  ALTER TABLE "BankAccount"
    ADD CONSTRAINT "BankAccount_glAccountId_fkey"
    FOREIGN KEY ("glAccountId") REFERENCES "ChartOfAccount"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "BankTransaction"
  ADD COLUMN IF NOT EXISTS "matchAutoCreated" BOOLEAN NOT NULL DEFAULT false;
