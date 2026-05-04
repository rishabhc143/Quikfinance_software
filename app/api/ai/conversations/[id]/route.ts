import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { user, organization } = await requireOrganization();
  const conversation = await db.aiConversation.findFirst({
    where: { id: params.id, userId: user.id, organizationId: organization.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages.map((m) => ({ role: m.role, content: m.content })),
  });
}
