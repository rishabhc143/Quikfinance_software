import "server-only";

/**
 * CFO Copilot Mutating Tools v1 — executors.
 *
 * Each ActionType has one executor function. Called by the
 * `/api/cashflow/copilot/actions/[id]/approve` route after the
 * user clicks Approve. Returns a JSON result that gets stashed
 * on the CopilotProposedAction.executionResult so the chat UI
 * can render "Done — alert dismissed" inline.
 *
 * Executors MUST be idempotent — the user could double-click
 * Approve. The dispatcher locks via `status='pending'` check
 * before invoking but that's not race-proof; executors should
 * tolerate "already done" gracefully.
 */

import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";
import type { ActionPayload, ActionType } from "./types";

type ExecutorContext = {
  organizationId: string;
  userId: string;
  proposalId: string;
};

const executors: {
  [K in ActionType]: (
    payload: ActionPayload[K],
    ctx: ExecutorContext
  ) => Promise<unknown>;
} = {
  dismiss_anomaly_alert: async (payload, ctx) => {
    // Org-scope check via findFirst — silent no-op if the alert
    // doesn't belong to the caller's org.
    const alert = await db.anomalyAlert.findFirst({
      where: { id: payload.alertId, organizationId: ctx.organizationId },
      select: { id: true, status: true, title: true },
    });
    if (!alert) throw new Error(`Alert ${payload.alertId} not found`);
    if (alert.status !== "open") {
      // Already dismissed by some other path — idempotent success.
      return { ok: true, alreadyDismissed: true };
    }
    await db.anomalyAlert.update({
      where: { id: alert.id },
      data: {
        status: "dismissed",
        dismissedAt: new Date(),
        dismissedById: ctx.userId,
        dismissReason: payload.reason ?? `Approved via Copilot proposal ${ctx.proposalId}`,
      },
    });
    await writeAuditLog({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: "UPDATE",
      entityType: "AnomalyAlert",
      entityId: alert.id,
      before: { status: "open" },
      after: {
        status: "dismissed",
        viaCopilot: true,
        proposalId: ctx.proposalId,
      },
    });
    return { ok: true, alertTitle: alert.title };
  },
};

export async function executeAction(args: {
  actionType: ActionType;
  payload: unknown;
  organizationId: string;
  userId: string;
  proposalId: string;
}): Promise<unknown> {
  const exec = executors[args.actionType];
  if (!exec) {
    throw new Error(`No executor registered for actionType: ${args.actionType}`);
  }
  // Cast is safe because the proposer validated the payload at
  // creation time and the actionType key is the discriminant.
  return exec(args.payload as never, {
    organizationId: args.organizationId,
    userId: args.userId,
    proposalId: args.proposalId,
  });
}
