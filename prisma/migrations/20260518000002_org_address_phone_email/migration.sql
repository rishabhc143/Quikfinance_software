-- Add address / phone / email columns to Organization so the
-- invoice PDF can render the supplier block at the top of the
-- TAX INVOICE layout. All nullable + idempotent.

ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "phoneNumber" TEXT;
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "email" TEXT;
