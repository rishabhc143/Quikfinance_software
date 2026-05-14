-- ACCT-E — Zoho-parity Chart of Accounts defaults.
--
-- Adds a `subType` column to ChartOfAccount so we can carry the
-- granular Zoho label (e.g. "Other Current Asset", "Cash", "Fixed
-- Asset", "Non Current Liability", "Stock") alongside our 8-variant
-- `type` enum. The list page renders subType when present and
-- falls back to the broad type label otherwise.
--
-- Idempotent — safe to re-apply via instrumentation.ts auto-migrate.

ALTER TABLE "ChartOfAccount" ADD COLUMN IF NOT EXISTS "subType" TEXT;
