-- BNK-A polish: capture the date the user's opening balance was struck.
-- Zoho Books asks for both an opening balance amount AND an "as of" date
-- so the running balance from the first imported transaction lines up
-- with the bank's actual statement. We had only the amount.
--
-- Additive, nullable column. Existing rows stay null (we treat null as
-- "before any transaction" — the prior implicit semantic).

ALTER TABLE "BankAccount"
  ADD COLUMN IF NOT EXISTS "openingBalanceAsOf" TIMESTAMP(3);
