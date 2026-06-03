-- Item Sales Information: add Zoho-standard fields
--   * salesTaxId — default sales tax to apply when this item is added to an invoice
--   * sellingPriceInclusiveOfTax — whether the selling price already includes tax
--
-- Both fields are nullable / default-false so existing rows are unaffected.
-- FK uses SET NULL on delete so dropping a tax doesn't cascade-orphan items.
-- Idempotent (IF NOT EXISTS) so safe to re-apply on cold-start migrate.

ALTER TABLE "Item"
  ADD COLUMN IF NOT EXISTS "salesTaxId" TEXT;

ALTER TABLE "Item"
  ADD COLUMN IF NOT EXISTS "sellingPriceInclusiveOfTax" BOOLEAN NOT NULL DEFAULT false;

-- FK to Tax — only added if missing. Postgres has no IF NOT EXISTS for
-- ADD CONSTRAINT, so wrap in DO block that checks pg_constraint first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Item_salesTaxId_fkey'
  ) THEN
    ALTER TABLE "Item"
      ADD CONSTRAINT "Item_salesTaxId_fkey"
      FOREIGN KEY ("salesTaxId") REFERENCES "Tax"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Item_salesTaxId_idx" ON "Item"("salesTaxId");
