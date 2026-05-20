-- Track whether each time entry is billable to the customer.
-- Nullable so existing rows stay valid (NULL = unknown / legacy);
-- new entries from the Start Timer modal always write a real bool.
ALTER TABLE "TimeEntry" ADD COLUMN IF NOT EXISTS "billable" BOOLEAN;
