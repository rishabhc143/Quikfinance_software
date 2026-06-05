import { NextResponse } from "next/server";
import { requireOrganization } from "@/lib/auth-helpers";
import { db } from "@/lib/db";

/**
 * CF-6 — List the current user's recent Copilot conversations.
 *
 * Org + user scoped (a user can't see another user's chats even
 * inside the same org — these are private working sessions, not
 * shared dashboards). Returns the 50 most-recent.
 *
 * For each row we also fetch the latest message timestamp so the
 * sidebar can sort by "last active" rather than "created", which
 * matches how users actually think about chat threads.
 */
export async function GET() {
  const { user, organization } = await requireOrganization();

  const conversations = await db.aiConversation.findMany({
    where: {
      organizationId: organization.id,
      userId: user.id,
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      messages: {
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title ?? "Untitled conversation",
      messageCount: c._count.messages,
      lastActiveAt: c.messages[0]?.createdAt ?? c.createdAt,
      createdAt: c.createdAt,
    })),
  });
}
