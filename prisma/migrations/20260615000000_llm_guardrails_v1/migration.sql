-- Phase-8 Sprint-2 LLM Guardrails v1.
--
-- Schema additions:
--   1. AiMessage gains tokensIn / tokensOut / latencyMs / model /
--      stopReason for per-call telemetry (powers the cost dashboard
--      + retroactive debugging).
--   2. New OrganizationAIUsage table aggregates daily token spend
--      per org so the budget gate at request time is an O(1) lookup
--      rather than a sum over AiMessage rows.
--
-- All additive + idempotent.

-- ── AiMessage telemetry columns ─────────────────────────────────
ALTER TABLE "AiMessage" ADD COLUMN IF NOT EXISTS "tokensIn"   INTEGER;
ALTER TABLE "AiMessage" ADD COLUMN IF NOT EXISTS "tokensOut"  INTEGER;
ALTER TABLE "AiMessage" ADD COLUMN IF NOT EXISTS "latencyMs"  INTEGER;
ALTER TABLE "AiMessage" ADD COLUMN IF NOT EXISTS "model"      TEXT;
ALTER TABLE "AiMessage" ADD COLUMN IF NOT EXISTS "stopReason" TEXT;

-- Conversation-detail page reads messages in createdAt order.
CREATE INDEX IF NOT EXISTS "AiMessage_conversationId_createdAt_idx"
  ON "AiMessage"("conversationId", "createdAt");

-- ── OrganizationAIUsage ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "OrganizationAIUsage" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  -- Midnight UTC of the calendar day this row aggregates.
  "day"            TIMESTAMP(3) NOT NULL,
  "tokensIn"       INTEGER NOT NULL DEFAULT 0,
  "tokensOut"      INTEGER NOT NULL DEFAULT 0,
  -- USD cents to avoid float drift across many small accumulations.
  -- 1¢ = 0.01 USD. Anthropic Sonnet 4.5 input is 3 USD / 1M tokens
  -- = 0.0003¢/token; output is 15 USD / 1M tokens = 0.0015¢/token.
  "costCents"      INTEGER NOT NULL DEFAULT 0,
  "callCount"      INTEGER NOT NULL DEFAULT 0,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrganizationAIUsage_organizationId_fkey'
  ) THEN
    ALTER TABLE "OrganizationAIUsage"
      ADD CONSTRAINT "OrganizationAIUsage_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

-- Upsert key — one row per org per day.
CREATE UNIQUE INDEX IF NOT EXISTS "OrganizationAIUsage_org_day_unique"
  ON "OrganizationAIUsage"("organizationId", "day");

-- Dashboard query: last 30 days for an org, newest first.
CREATE INDEX IF NOT EXISTS "OrganizationAIUsage_org_day_desc_idx"
  ON "OrganizationAIUsage"("organizationId", "day" DESC);
