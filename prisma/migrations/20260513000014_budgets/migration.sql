-- ACCT-D — Budgets (per-account annual targets + Budget vs Actuals).
--
-- Two tables: `Budget` is the header for one fiscal year's plan;
-- `BudgetLine` stores 12 rows per budgeted account (one per month
-- bucket) so a future per-month edit UI can land without a schema
-- migration. v1 form accepts an annual figure and auto-distributes.
--
-- The (org, fiscalYear, name) tuple is unique so accountants can
-- run multiple budgets per year (e.g. "Plan A — aggressive" /
-- "Plan B — conservative") but each name is one-per-year.
--
-- Idempotent — safe to re-apply via instrumentation.ts auto-migrate.

CREATE TABLE IF NOT EXISTS "Budget" (
  "id"              TEXT PRIMARY KEY,
  "organizationId"  TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "fiscalYear"      INTEGER NOT NULL,
  "status"          TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Budget_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Budget_org_year_name_unique"
  ON "Budget"("organizationId", "fiscalYear", "name");
CREATE INDEX IF NOT EXISTS "Budget_org_status_idx"
  ON "Budget"("organizationId", "status");

CREATE TABLE IF NOT EXISTS "BudgetLine" (
  "id"            TEXT PRIMARY KEY,
  "budgetId"      TEXT NOT NULL,
  "accountId"     TEXT NOT NULL,
  "periodStart"   DATE NOT NULL,
  "periodEnd"     DATE NOT NULL,
  "amount"        DECIMAL(18, 4) NOT NULL DEFAULT 0,
  CONSTRAINT "BudgetLine_budgetId_fkey"
    FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE,
  CONSTRAINT "BudgetLine_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "BudgetLine_budgetId_idx"
  ON "BudgetLine"("budgetId");
CREATE INDEX IF NOT EXISTS "BudgetLine_accountId_periodStart_idx"
  ON "BudgetLine"("accountId", "periodStart");
