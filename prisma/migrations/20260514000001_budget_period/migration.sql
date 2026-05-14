-- ACCT-D.2 — Budget Period column.
--
-- The Zoho-parity New Budget form (PR #153) introduces a Budget
-- Period dropdown with three values:
--   MONTHLY  → 12 BudgetLine rows per account (current behavior)
--   QUARTERLY → 4 BudgetLine rows per account
--   YEARLY    → 1 BudgetLine row per account
--
-- BudgetLine already stores arbitrary periodStart/periodEnd ranges,
-- so no schema change is needed there — the action just emits
-- fewer rows with wider ranges when the period is Q or Y.
--
-- Existing budgets keep the default 'MONTHLY' (they were all
-- created with 12 monthly buckets).
--
-- Idempotent — safe to re-apply via instrumentation.ts auto-migrate.

ALTER TABLE "Budget"
  ADD COLUMN IF NOT EXISTS "budgetPeriod" TEXT NOT NULL DEFAULT 'MONTHLY';
