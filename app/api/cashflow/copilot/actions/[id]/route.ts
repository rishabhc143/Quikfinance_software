import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { executeAction } from "@/lib/copilot/actions/executors";
import type { ActionType } from "@/lib/copilot/actions/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * CFO Copilot Mutating Tools v1 — approve / reject endpoint.
 *
 * POST /api/cashflow/copilot/actions/[id]
 *
 * Body: { decision: "approve" | "reject", reason?: string }
 *
 * Approve:
 *   - Validates org scoping + status='pending' + not expired
 *   - Dispatches to the matching executor (lib/copilot/actions/executors.ts)
 *   - Flips status to 'approved'
 *   - Stashes executor result on executionResult OR error on executionError
 *
 * Reject:
 *   - Validates org scoping + status='pending'
 *   - Flips status to 'rejected'
 *   - Records optional reason
 *   - No executor runs
 *
 * Idempotent: re-POST on a non-pending proposal returns the current
 * state without re-running anything.
 */

const bodySchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(500).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { user, organization } = await requireOrganization();
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const proposal = await db.copilotProposedAction.findFirst({
    where: { id: params.id, organizationId: organization.id },
  });
  if (!proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  // Idempotent: caller can re-fetch state of a non-pending proposal
  // (e.g. double-click on Approve button) without re-execution.
  if (proposal.status !== "pending") {
    return NextResponse.json({
      ok: true,
      status: proposal.status,
      executionResult: proposal.executionResult,
      executionError: proposal.executionError,
      summary: proposal.summary,
    });
  }

  if (proposal.expiresAt < new Date()) {
    await db.copilotProposedAction.update({
      where: { id: proposal.id },
      data: { status: "expired" },
    });
    return NextResponse.json(
      { error: "Proposal expired. Re-ask the Copilot." },
      { status: 410 }
    );
  }

  if (parsed.data.decision === "reject") {
    await db.copilotProposedAction.update({
      where: { id: proposal.id },
      data: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectReason: parsed.data.reason ?? null,
      },
    });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // Approve path: run the executor.
  let executionResult: unknown = null;
  let executionError: string | null = null;
  try {
    executionResult = await executeAction({
      actionType: proposal.actionType as ActionType,
      payload: proposal.payload,
      organizationId: organization.id,
      userId: user.id,
      proposalId: proposal.id,
    });
  } catch (e) {
    executionError = e instanceof Error ? e.message : String(e);
  }

  await db.copilotProposedAction.update({
    where: { id: proposal.id },
    data: {
      status: "approved",
      approvedAt: new Date(),
      executionResult:
        executionResult == null
          ? undefined
          : (executionResult as object),
      executionError,
    },
  });

  return NextResponse.json({
    ok: !executionError,
    status: "approved",
    executionResult,
    executionError,
    summary: proposal.summary,
  });
}
