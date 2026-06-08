import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import {
  GuardrailError,
  PROMPT_INJECTION_GUARD,
  assertWithinBudget,
  assertWithinRateLimit,
  recordLlmCall,
} from "@/lib/llm/guardrails";

export const runtime = "nodejs";
// Match the Copilot's ceiling. /api/ai/chat doesn't use tools so
// 10s is usually enough, but a single long Sonnet response can
// exceed it; 60s is safer and matches the Hobby tier cap.
export const maxDuration = 60;

const schema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1),
  })).min(1),
  conversationId: z.string().optional(),
});

const SYSTEM_PROMPT = `\
${PROMPT_INJECTION_GUARD}

You are Quikfinance's in-app assistant. You answer questions about accounting, bookkeeping, GST, taxes, invoicing, and how to use Quikfinance features. Be concise, accurate, and friendly. You do not provide legal or investment advice. If asked something outside scope, politely redirect.`;

const MODEL = "claude-sonnet-4-5";

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI assistant is not configured (ANTHROPIC_API_KEY missing)." }, { status: 503 });
  }
  const { user, organization } = await requireOrganization();
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Org-specific per-user limit (configurable via
  // OrganizationPreference.aiRateLimitPerDay) — falls through to
  // the shared default when null.
  const prefs = await db.organizationPreference.findUnique({ where: { organizationId: organization.id } });
  const userLimit = prefs?.aiRateLimitPerDay ?? undefined;

  try {
    await assertWithinRateLimit({
      organizationId: organization.id,
      userId: user.id,
      ...(userLimit ? { limit: userLimit } : {}),
    });
    await assertWithinBudget({ organizationId: organization.id });
  } catch (e) {
    if (e instanceof GuardrailError) {
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: 429 }
      );
    }
    throw e;
  }

  const systemPrompt = (prefs?.aiSystemPromptOverride && prefs.aiSystemPromptOverride.trim())
    ? `${PROMPT_INJECTION_GUARD}\n\n${prefs.aiSystemPromptOverride}`
    : SYSTEM_PROMPT;

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
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let stopReason = "unknown";
  const startedAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const live = anthropic.messages.stream(
          {
            model: MODEL,
            max_tokens: 1024,
            system: systemPrompt,
            messages: parsed.data.messages,
          },
          { signal: req.signal }
        );
        for await (const event of live) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            acc += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          } else if (event.type === "message_delta") {
            // usage updates arrive on message_delta events. Sum them
            // here so even partial streams (abort/timeout) record
            // the tokens we actually used.
            const usage = event.usage as { input_tokens?: number; output_tokens?: number } | undefined;
            if (usage?.input_tokens) totalTokensIn = usage.input_tokens;
            if (usage?.output_tokens) totalTokensOut = usage.output_tokens;
            if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
          }
        }
        controller.close();
      } catch (err) {
        if (req.signal.aborted) {
          stopReason = "abort";
        } else {
          const msg = err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(encoder.encode(`\n[error: ${msg}]`));
        }
        controller.close();
      }

      const latencyMs = Date.now() - startedAt;
      if (conversation && (acc.trim() || totalTokensIn > 0)) {
        try {
          await recordLlmCall({
            organizationId: organization.id,
            conversationId: conversation.id,
            role: "assistant",
            content: acc || "(empty)",
            tokensIn: totalTokensIn,
            tokensOut: totalTokensOut,
            latencyMs,
            model: MODEL,
            stopReason,
          });
        } catch (persistErr) {
          console.error("[ai-chat] failed to record LLM call", persistErr);
        }
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
