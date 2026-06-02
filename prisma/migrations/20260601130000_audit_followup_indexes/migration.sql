-- Audit follow-up batch 1: composite indexes for queries that filter
-- by org + status + date OR org + date. Surfaces in the senior-engineer
-- audit MED-1. Idempotent: safe to re-run.
--
-- Why:
--  * Bill: cron jobs (bill-statuses) + AP aging report filter open bills
--    by due date. Without a composite index this is a sequential scan
--    once a single org has 10k+ bills.
--  * PaymentMade: dashboard cashflow chart + reports filter by
--    paymentDate ranges. Same issue at scale.
--
-- Both indexes are ASCENDING; Postgres can scan ascending B-trees in
-- either direction without a separate descending index.

CREATE INDEX IF NOT EXISTS "Bill_organizationId_status_dueDate_idx"
    ON "Bill"("organizationId", "status", "dueDate");

CREATE INDEX IF NOT EXISTS "PaymentMade_organizationId_paymentDate_idx"
    ON "PaymentMade"("organizationId", "paymentDate");
