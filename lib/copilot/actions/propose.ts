import "server-only";

/**
 * CFO Copilot Mutating Tools v1 — proposal creator.
 *
 * Shared helper invoked by every mutating tool. Validates the
 * payload, creates a CopilotProposedAction row with status=pending,
 * sets a 24-hour expiry, and returns the proposal data Claude
 * can include in its response so the UI knows what to render.
 */

import { db } from "@/lib/db";
import type {
  ActionPayload,
  ActionType,
  ProposalResult,
} from "./types";

const TTL_HOURS = 24;

export async function proposeAction<T extends ActionType>(args: {
  organizationId: string;
  userId: string;
  conversationId: string | null;
  actionType: T;
  payload: ActionPayload[T];
  summary: string;
}): Promise<ProposalResult<T>> {
  const expiresAt = new Date(Date.now() + TTL_HOURS * 3600 * 1000);
  const row = await db.copilotProposedAction.create({
    data: {
      organizationId: args.organizationId,
      userId: args.userId,
      conversationId: args.conversationId,
      actionType: args.actionType,
      payload: args.payload as unknown as object,
      summary: args.summary,
      expiresAt,
    },
    select: { id: true },
  });
  return {
    proposalId: row.id,
    type: args.actionType,
    payload: args.payload,
    summary: args.summary,
    expiresAt: expiresAt.toISOString(),
  };
}
