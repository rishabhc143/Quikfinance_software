-- BNK-E: Transaction Rules
--
-- One table + one column. Rules auto-categorise bank lines on import:
--
--   IF (condition list, joined by combinator AND/OR)
--   THEN Categorise to actionGlAccountId
--
-- Conditions live in JSONB ({field, op, value} tuples) so we can grow
-- the operator set without schema churn. The action is a single GL
-- account today — Zoho's "Record As" variants are deferred to BNK-E.2.
-- Priority is an integer: lower wins. Per-account rules (bankAccountId
-- not null) win against org-wide rules (null) when both match.
--
-- Idempotent (safe to re-apply via instrumentation.ts auto-migrate).

CREATE TABLE IF NOT EXISTS "BankRule" (
  "id"                TEXT PRIMARY KEY,
  "organizationId"    TEXT NOT NULL,
  "bankAccountId"     TEXT,
  "name"              TEXT NOT NULL,
  "priority"          INTEGER NOT NULL DEFAULT 100,
  "isActive"          BOOLEAN NOT NULL DEFAULT true,
  "conditionsJson"    JSONB NOT NULL,
  "combinator"        TEXT NOT NULL DEFAULT 'AND',
  "actionGlAccountId" TEXT NOT NULL,
  "actionNotes"       TEXT,
  "timesFired"        INTEGER NOT NULL DEFAULT 0,
  "lastFiredAt"       TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankRule_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE,
  CONSTRAINT "BankRule_bankAccountId_fkey"
    FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL,
  CONSTRAINT "BankRule_actionGlAccountId_fkey"
    FOREIGN KEY ("actionGlAccountId") REFERENCES "ChartOfAccount"("id") ON DELETE RESTRICT
);

-- Per-account-first ordering with priority is the hot lookup pattern
-- during import.
CREATE INDEX IF NOT EXISTS "BankRule_org_account_priority_idx"
  ON "BankRule"("organizationId", "bankAccountId", "priority");

-- Per-row audit pointer: which rule fired on this BankTransaction.
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "appliedRuleId" TEXT;
DO $$ BEGIN
  ALTER TABLE "BankTransaction"
    ADD CONSTRAINT "BankTransaction_appliedRuleId_fkey"
    FOREIGN KEY ("appliedRuleId") REFERENCES "BankRule"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
