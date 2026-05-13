-- RPT-A — add the missing FK from JournalEntryLine.accountId to
-- ChartOfAccount.id. The column has existed since the init migration
-- but never had a Prisma relation declared, so reports couldn't
-- `include` the account in one query.
--
-- All existing data already references valid ChartOfAccount rows
-- (BNK-D and BNK-E write through verified paths), so this is safe.
-- Idempotent — survives re-application.

DO $$ BEGIN
  ALTER TABLE "JournalEntryLine"
    ADD CONSTRAINT "JournalEntryLine_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
