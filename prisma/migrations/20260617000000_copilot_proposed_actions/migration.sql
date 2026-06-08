-- CFO Copilot Mutating Tools v1 — proposed-action approval gate.
--
-- Read-only tools dispatch immediately. Mutating tools register a
-- proposed action via this table and return its id; the UI shows an
-- approval card; the user clicks Approve → server executes →
-- status flips. Without explicit user approval, no mutation runs.
--
-- Why a dedicated table (vs ephemeral in-memory state):
--   1. Survives page reloads. Customer asks "send a reminder",
--      Claude proposes it, customer accidentally refreshes — without
--      persistence the proposal evaporates. With persistence the
--      UI re-renders the card.
--   2. Audit trail. Every proposed-then-rejected action is logged
--      alongside approved ones — useful for "the Copilot suggested
--      sending money I didn't approve" debugging.
--   3. Future async actions. Some mutations (e.g. "schedule payment
--      for Friday") need to persist anyway. Same table.

CREATE TABLE IF NOT EXISTS "CopilotProposedAction" (
  "id"             TEXT PRIMARY KEY,
  "organizationId" TEXT NOT NULL,
  "userId"         TEXT NOT NULL,
  "conversationId" TEXT,
  -- Tool name that proposed this. One row per (orgId, type, target)
  -- prevents duplicate proposals — see partial unique index below.
  "actionType"     TEXT NOT NULL,
  -- "pending" | "approved" | "rejected" | "expired"
  "status"         TEXT NOT NULL DEFAULT 'pending',
  -- Full proposal payload as JSON. Shape depends on actionType.
  -- Mapper at lib/copilot/actions/types.ts narrows per type.
  "payload"        JSONB NOT NULL,
  -- Human-readable summary the UI shows in the approval card.
  "summary"        TEXT NOT NULL,
  -- 24-hour TTL. After this the proposal can't be approved; the
  -- user has to re-ask. Prevents stale approvals.
  "expiresAt"      TIMESTAMP(3) NOT NULL,
  -- Audit trail: when + by-whom for each lifecycle transition.
  "approvedAt"     TIMESTAMP(3),
  "rejectedAt"     TIMESTAMP(3),
  -- Free-text rejection reason (optional).
  "rejectReason"   TEXT,
  -- When status flips to 'approved' and the underlying mutation
  -- runs, we stash the executor's result here (e.g. "alert dismissed",
  -- "email sent to john@x.com with id rsmd_xyz").
  "executionResult" JSONB,
  -- When status flips to 'approved' and the mutation FAILS, the
  -- error message lives here. Status stays 'approved' so the user
  -- knows their intent was honoured even if execution failed.
  "executionError" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'CopilotProposedAction_organizationId_fkey'
  ) THEN
    ALTER TABLE "CopilotProposedAction"
      ADD CONSTRAINT "CopilotProposedAction_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
      ON DELETE CASCADE;
  END IF;
END $$;

-- Sidebar query on the chat — "what's pending for me this conversation?"
CREATE INDEX IF NOT EXISTS "CopilotProposedAction_conv_status_idx"
  ON "CopilotProposedAction"("conversationId", "status", "createdAt" DESC)
  WHERE "conversationId" IS NOT NULL;

-- Pending actions for an org — used by the alerts page to badge
-- alerts that have an in-flight proposal.
CREATE INDEX IF NOT EXISTS "CopilotProposedAction_org_pending_idx"
  ON "CopilotProposedAction"("organizationId", "createdAt" DESC)
  WHERE "status" = 'pending';
