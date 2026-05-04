import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";

export async function GET() {
  const { user, organization } = await requireOrganization();
  const conversations = await db.aiConversation.findMany({
    where: { userId: user.id, organizationId: organization.id },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      messages: {
        take: 1,
        orderBy: { createdAt: "asc" },
        select: { content: true },
      },
      _count: { select: { messages: true } },
    },
  });
  return NextResponse.json(
    conversations.map((c) => ({
      id: c.id,
      title: c.title ?? c.messages[0]?.content?.slice(0, 60) ?? "New conversation",
      messageCount: c._count.messages,
      createdAt: c.createdAt.toISOString(),
    })),
  );
}
