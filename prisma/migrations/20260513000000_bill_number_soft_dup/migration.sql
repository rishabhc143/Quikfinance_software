-- Bill number duplicates are now SOFT WARNINGS per <bills_spec>:
--   "duplicates flagged with warning but allowed"
-- The hard unique constraint shipped in PR #81 was too strict — vendors
-- sometimes reuse their own numbers across restatements (and the spec
-- explicitly says to allow the override).
--
-- Drop the unique constraint and replace with a plain non-unique index
-- so the duplicate-check query stays fast.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Bill_organizationId_contactId_number_key'
  ) THEN
    ALTER TABLE "Bill"
      DROP CONSTRAINT "Bill_organizationId_contactId_number_key";
  END IF;
END$$;

-- The unique constraint also created a unique index of the same name.
-- Drop it if it lingered (Prisma usually drops it with the constraint
-- but we add `IF EXISTS` for safety on re-applies).
DROP INDEX IF EXISTS "Bill_organizationId_contactId_number_key";

CREATE INDEX IF NOT EXISTS "Bill_organizationId_contactId_number_idx"
  ON "Bill" ("organizationId", "contactId", "number");
