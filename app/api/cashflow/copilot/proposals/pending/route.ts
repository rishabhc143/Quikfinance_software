import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CFO Copilot Mutating Tools v1 — list pending proposals.
 *
 * GET /api/cashflow/copilot/proposals/pending?conversationId=...
 *
 * Returns all CopilotProposedAction rows for the org+user+conversation
 * with status='pending' AND not yet expired. Used by the chat UI to
 * render approval cards inline above the input box.
 *
 * Returns empty array when conversationId is omitted (the v1 UI
 * only renders proposals for the active conversation).
 */
export async function GET(req: Request) {
  const { user, organization } = await requireOrganization();
  const url = new URL(req.url);
  const conversationId = url.searchParams.get("conversationId");
  if (!conversationId) {
    return NextResponse.json({ proposals: [] });
  }

  const rows = await db.copilotProposedAction.findMany({
    where: {
      organizationId: organization.id,
      userId: user.id,
      conversationId,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      actionType: true,
      summary: true,
      payload: true,
      expiresAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ proposals: rows });
}
