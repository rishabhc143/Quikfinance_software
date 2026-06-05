import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth-helpers";
import { db } from "@/lib/db";

/**
 * CF-6 — Load full message history for one Copilot conversation, or
 * delete the conversation entirely. Org + user scoped (a user can
 * only read/delete their own threads).
 */

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { user, organization } = await requireOrganization();
  const conversation = await db.aiConversation.findFirst({
    where: {
      id: params.id,
      organizationId: organization.id,
      userId: user.id,
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      messages: {
        select: { id: true, role: true, content: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 }
    );
  }
  return NextResponse.json({ conversation });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { user, organization } = await requireOrganization();
  // Defensive scoping: deleteMany rather than delete so a wrong-org
  // id silently no-ops instead of erroring with a 404 leak.
  await db.aiConversation.deleteMany({
    where: {
      id: params.id,
      organizationId: organization.id,
      userId: user.id,
    },
  });
  return NextResponse.json({ ok: true });
}
