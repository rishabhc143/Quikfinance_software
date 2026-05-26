-- Bills Zoho-layout (PR #270): add doc-level TDS/TCS toggle on Bill
-- and per-line discount + ITC eligibility on BillLineItem. Columns
-- are nullable / have defaults so existing rows stay valid.
--
-- UI for these fields ships in a follow-up PR; this migration just
-- makes the data foundation ready so we can layer the form changes
-- without a follow-up schema PR blocking it.

ALTER TABLE "Bill"
  ADD COLUMN IF NOT EXISTS "taxType" TEXT;

ALTER TABLE "BillLineItem"
  ADD COLUMN IF NOT EXISTS "discount" DECIMAL(18,4),
  ADD COLUMN IF NOT EXISTS "discountType" TEXT,
  ADD COLUMN IF NOT EXISTS "itcEligible" BOOLEAN NOT NULL DEFAULT true;
