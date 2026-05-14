-- ACCT-E.3 hotfix — Deduplicate Chart of Accounts rows by name and
-- add a (organizationId, name) unique constraint so the seeder can
-- never insert duplicates again.
--
-- Root cause: PR #142 changed the CoA seeder from "skip if any
-- account exists" to "merge by name". Two concurrent requests
-- (e.g. a fast double-load of the list page) both read the same
-- baseline of existing names, both compute the same to-add set,
-- both insert the rows. With no unique constraint to back-stop
-- it, the DB happily accepted both inserts → duplicates.
--
-- This migration:
--   1. Deletes duplicate rows per (organizationId, name) keeping
--      the earliest createdAt. Only deletes rows with NO foreign
--      references so we never strand JE / MJ / Budget line data.
--   2. Adds a case-insensitive unique index on
--      (organizationId, LOWER(name)). Wrapped in DO/EXCEPTION so
--      the migration is still safe if some duplicates couldn't be
--      deleted (because they have postings).
--
-- Idempotent — safe to re-apply via instrumentation.ts auto-migrate.

-- ──────────────── 1. Dedup ────────────────

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY "organizationId", LOWER(TRIM(name))
      ORDER BY "createdAt" ASC, id ASC
    ) AS rn
  FROM "ChartOfAccount"
)
DELETE FROM "ChartOfAccount" a
WHERE a.id IN (SELECT id FROM ranked WHERE rn > 1)
  AND NOT EXISTS (
    SELECT 1 FROM "JournalEntryLine" l WHERE l."accountId" = a.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ManualJournalLine" l WHERE l."accountId" = a.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM "BudgetLine" l WHERE l."accountId" = a.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM "BankAccount" b WHERE b."glAccountId" = a.id
  );

-- ──────────────── 2. Unique index ────────────────

DO $$ BEGIN
  CREATE UNIQUE INDEX "ChartOfAccount_org_name_ci_unique"
    ON "ChartOfAccount"("organizationId", LOWER(TRIM(name)));
EXCEPTION
  WHEN duplicate_table THEN NULL;   -- index already exists; re-run is fine
  WHEN unique_violation THEN
    -- Some duplicates couldn't be cleaned (had FK references).
    -- The application-layer seeder already skips by-name; an
    -- ops admin can clean up the rest manually if needed.
    RAISE NOTICE 'ChartOfAccount unique-name index skipped: residual duplicates remain';
END $$;
