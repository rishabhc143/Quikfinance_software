-- ACCT-C — Currency Adjustment journals.
--
-- Stores the "I'm revaluing my USD-denominated balances on this
-- date" header. Each adjustment posts a balanced JE referenced as
-- `CADJ:<id>`, with each line offsetting against either
-- SYS-FX-GAIN (OTHER_INCOME) or SYS-FX-LOSS (OTHER_EXPENSE).
--
-- v1 is manual entry: the accountant says "add 1,200 INR gain to
-- AR" and we post DR AR / CR SYS-FX-GAIN. Auto-balance computation
-- from per-line FC amounts ships in a follow-up once
-- JournalEntryLine grows fcAmount + fcCurrency columns.
--
-- Idempotent — safe to re-apply via instrumentation.ts auto-migrate.

CREATE TABLE IF NOT EXISTS "CurrencyAdjustment" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "number"         TEXT NOT NULL,
  "date"           DATE NOT NULL,
  "currency"       TEXT NOT NULL,           -- 3-letter ISO; the FC being revalued
  "exchangeRate"   DECIMAL(18, 6),          -- optional, informational
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CurrencyAdjustment_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CurrencyAdjustment_org_number_unique"
  ON "CurrencyAdjustment"("organizationId", "number");
CREATE INDEX IF NOT EXISTS "CurrencyAdjustment_org_date_idx"
  ON "CurrencyAdjustment"("organizationId", "date");
