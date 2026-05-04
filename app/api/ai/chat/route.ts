import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { startOfDay } from "date-fns";

export const runtime = "nodejs";

const schema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1),
  })).min(1),
  conversationId: z.string().optional(),
});

const SYSTEM_PROMPT = `You are Quikfinance's in-app assistant. You answer questions about accounting, bookkeeping, GST, taxes, invoicing, and how to use Quikfinance features. Be concise, accurate, and friendly. You do not provide legal or investment advice. If asked something outside scope, politely redirect.`;

const RATE_LIMIT_PER_DAY = 50;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI assistant is not configured (ANTHROPIC_API_KEY missing)." }, { status: 503 });
  }
  const { user, organization } = await requireOrganization();
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const prefs = await db.organizationPreference.findUnique({ where: { organizationId: organization.id } });
  const limit = prefs?.aiRateLimitPerDay ?? RATE_LIMIT_PER_DAY;
  const todayStart = startOfDay(new Date());
  const todayCount = await db.aiMessage.count({
    where: {
      conversation: { userId: user.id, organizationId: organization.id },
      role: "user",
      createdAt: { gte: todayStart },
    },
  });
  if (limit > 0 && todayCount >= limit) {
    return NextResponse.json({ error: "You've reached today's AI assistant limit. Try again tomorrow." }, { status: 429 });
  }
  const systemPrompt = (prefs?.aiSystemPromptOverride && prefs.aiSystemPromptOverride.trim()) ? prefs.aiSystemPromptOverride : SYSTEM_PROMPT;

  const conversation = parsed.data.conversationId
    ? await db.aiConversation.findFirst({ where: { id: parsed.data.conversationId, userId: user.id, organizationId: organization.id } })
    : await db.aiConversation.create({ data: { userId: user.id, organizationId: organization.id } });

  const lastUser = parsed.data.messages.filter((m) => m.role === "user").at(-1);
  if (conversation && lastUser) {
    await db.aiMessage.create({ data: { conversationId: conversation.id, role: "user", content: lastUser.content } });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();
  let acc = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const live = anthropic.messages.stream({
          model: "claude-sonnet-4-6",
          max_tokens: 1024,
          system: systemPrompt,
          messages: parsed.data.messages,
        });
        for await (const event of live) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            acc += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
        if (conversation && acc) {
          await db.aiMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: acc } });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`\n[error: ${msg}]`));
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
