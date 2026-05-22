-- Remove D3.1: drop Organization.inboxEmailToken column and its unique index.
--
-- The email-forwarding inbox feature was removed at the product owner's
-- request. The token column carries no data we want to keep — orgs that
-- had a token lose it cleanly.
--
-- Idempotent: safe to re-run on databases where the column never existed
-- (e.g. fresh deploys where the original 20260521000003 migration
-- was applied and then this one ran together on first cold start).

DROP INDEX IF EXISTS "Organization_inboxEmailToken_key";
ALTER TABLE "Organization" DROP COLUMN IF EXISTS "inboxEmailToken";
