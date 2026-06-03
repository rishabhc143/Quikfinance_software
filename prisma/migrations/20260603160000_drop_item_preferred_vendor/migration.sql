-- Drop Item.preferredVendorId — Zoho Books doesn't have this field on the
-- item form (PR #340 removed the UI; this drops the column too).
--
-- Order: drop FK constraint, drop index, then drop the column. Each step
-- is idempotent so the migration is safe to re-run.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Item_preferredVendorId_fkey'
  ) THEN
    ALTER TABLE "Item" DROP CONSTRAINT "Item_preferredVendorId_fkey";
  END IF;
END $$;

DROP INDEX IF EXISTS "Item_preferredVendorId_idx";

ALTER TABLE "Item" DROP COLUMN IF EXISTS "preferredVendorId";
