-- Sprint 4 — CompanionVoucher.paidAmount.
--
-- Pairs with the payment-matcher in lib/migration/payment-matcher.ts.
-- Receipt vouchers reduce the paidAmount on their matched Sales
-- vouchers (FIFO by date); Payment vouchers do the same for
-- Purchase. companion-projection.ts then projects `total - paidAmount`
-- instead of full `total`, so fully-paid imported vouchers stop
-- contributing to the forecast (and the 90-day age cutoff becomes
-- unnecessary for them).
--
-- Additive + idempotent. Default 0 so existing rows are treated as
-- "fully unpaid" until the matcher re-runs.

ALTER TABLE "CompanionVoucher"
  ADD COLUMN IF NOT EXISTS "paidAmount" DECIMAL(18,4) NOT NULL DEFAULT 0;

-- Index for the matcher's per-party FIFO query — orders Sales /
-- Purchase by date when matching their Receipts / Payments.
CREATE INDEX IF NOT EXISTS "CompanionVoucher_party_type_date_idx"
  ON "CompanionVoucher"("partyLedgerId", "type", "date")
  WHERE "deletedAt" IS NULL AND "partyLedgerId" IS NOT NULL;
