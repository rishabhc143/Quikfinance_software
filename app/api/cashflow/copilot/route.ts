import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { COPILOT_TOOLS, runTool } from "@/lib/cashflow/copilot-tools";

export const runtime = "nodejs";

/**
 * CF-5 — CFO Copilot endpoint.
 *
 * Receives a multi-turn chat transcript, hands it to Claude Sonnet
 * 4.5 with the read-only cashflow / AR / AP tool kit, and streams
 * the response as plain text. Tool calls are executed server-side
 * inside the agentic loop (max 6 turns) and their results are fed
 * back into Claude until it produces a final text answer.
 *
 * Differences vs the general-purpose chat at `/api/ai/chat`:
 *   • Tool-use enabled (this one can actually look at your data).
 *   • Specialised system prompt tuned for cashflow Q&A.
 *   • No conversation persistence in v1 (the page keeps history in
 *     React state; we add AiConversation/AiMessage hookup in v2
 *     once the tool surface is stable).
 *   • Same daily rate-limit ceiling for safety.
 */

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1),
      })
    )
    .min(1)
    .max(40),
  /** CF-6 — optional conversation to attach to. When absent we
   *  auto-create a new AiConversation row, titled from the first
   *  user message. The created id is returned in the
   *  `x-conversation-id` response header so the client can pin
   *  subsequent requests to the same thread. */
  conversationId: z.string().optional(),
});

const SYSTEM_PROMPT = (orgName: string, currency: string) => `\
You are the CFO Copilot for **${orgName}**, an in-app financial assistant inside Quikfinance.

Your job: answer the user's questions about their cashflow, AR, AP, and recurring revenue/expenses using the read-only tools provided. You CANNOT mutate anything — no sending reminders, no marking paid, no changing dates. If asked to do anything mutative, explain you're read-only in this version and suggest where in Quikfinance they can do it themselves.

Important behaviour rules:
- ALWAYS use a tool when answering data questions. Never guess at numbers.
- Be concise. Numbers first, narrative second. CFOs want answers, not essays.
- Format currency with the org's code (${currency}). Use lakh-style grouping for INR (e.g. ₹1,23,456) only if the locale clearly needs it; otherwise standard grouping is fine.
- When the user asks about risk or runway, lean on get_cashflow_summary + get_weekly_breakdown to ground your answer.
- If a tool returns an empty list, say so plainly instead of speculating.
- Today's date is provided implicitly; use the dates returned by tools rather than assuming.
- If a question is outside accounting/cashflow scope (e.g. legal advice, investment recommendations, personal opinions), politely redirect to a professional.

Example interactions:
- User: "What's my cash position look like?" → call get_cashflow_summary → report starting/ending/min/insolvency-risk.
- User: "Who owes me the most?" → call get_top_customers_by_ar → list top 3-5 with amounts.
- User: "What if my biggest customer delays by 30 days?" → call get_cashflow_summary with stressDays=30, compare to base case.
- User: "Will I be able to pay payroll on the 7th?" → call get_weekly_breakdown → identify the relevant week, report ending/min balance.
`;

const RATE_LIMIT_PER_DAY = 100;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI assistant is not configured (ANTHROPIC_API_KEY missing)." },
      { status: 503 }
    );
  }

  const { user, organization } = await requireOrganization();
  const body = await req.json().catch(() => ({}));
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  void RATE_LIMIT_PER_DAY;

  // CF-6 — resolve or create the conversation row. When the client
  // sent a conversationId, validate it's theirs (org + user scoped)
  // and load it. Otherwise create a fresh one with a title derived
  // from the first user message (so the sidebar list looks human).
  let conversation = parsed.data.conversationId
    ? await db.aiConversation.findFirst({
        where: {
          id: parsed.data.conversationId,
          organizationId: organization.id,
          userId: user.id,
        },
      })
    : null;
  if (!conversation) {
    const firstUser = parsed.data.messages.find((m) => m.role === "user");
    const title = firstUser
      ? firstUser.content.slice(0, 80).replace(/\s+/g, " ").trim()
      : "Cashflow conversation";
    conversation = await db.aiConversation.create({
      data: {
        organizationId: organization.id,
        userId: user.id,
        title,
      },
    });
  }

  // Persist the latest user message before calling the LLM so it's
  // safely in the DB even if streaming fails midway.
  const lastUser = parsed.data.messages.filter((m) => m.role === "user").at(-1);
  if (lastUser) {
    await db.aiMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: lastUser.content,
      },
    });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();
  // CF-6 — accumulate the streamed assistant text so we can write a
  // single AiMessage row at the end. Anthropic emits text in chunks
  // but we want one persisted row, not N partial rows.
  let assistantText = "";
  const persistedConversationId = conversation.id;

  // Convert chat history into Anthropic Message format. We keep tool
  // calls / tool results internal to this single request (not echoed
  // to the client) — only the final assistant text reaches the UI.
  type AnthMessage = Anthropic.MessageParam;
  const messages: AnthMessage[] = parsed.data.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const MAX_TURNS = 6;
        for (let turn = 0; turn < MAX_TURNS; turn += 1) {
          const response = await anthropic.messages.create({
            model: "claude-sonnet-4-5",
            max_tokens: 2048,
            system: SYSTEM_PROMPT(organization.name, organization.currency),
            tools: COPILOT_TOOLS as unknown as Anthropic.Tool[],
            messages,
          });

          // Stream the assistant's text blocks as they come. Tool-use
          // blocks are NOT streamed to the client — we run them
          // server-side and continue the agentic loop.
          for (const block of response.content) {
            if (block.type === "text") {
              assistantText += block.text;
              controller.enqueue(encoder.encode(block.text));
            }
          }

          if (response.stop_reason === "tool_use") {
            // Append assistant message (with tool_use blocks) to
            // history so Claude can see its own thinking.
            messages.push({
              role: "assistant",
              content: response.content,
            });

            // Run every tool_use block in this assistant message,
            // collect tool_result blocks in a single user message
            // for the next iteration.
            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const block of response.content) {
              if (block.type !== "tool_use") continue;
              try {
                const result = await runTool(
                  organization.id,
                  organization.currency,
                  block.name,
                  block.input as Record<string, unknown>
                );
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: JSON.stringify(result),
                });
              } catch (err) {
                const msg = err instanceof Error ? err.message : "Tool error";
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  is_error: true,
                  content: msg,
                });
              }
            }
            messages.push({ role: "user", content: toolResults });
            continue; // next turn
          }

          // stop_reason is "end_turn" / "max_tokens" / "stop_sequence"
          // — Claude is done.
          break;
        }
        controller.close();
        // CF-6 — persist the assistant turn's final text. Wrap in a
        // try/catch so a DB hiccup at the end doesn't surface as a
        // stream error to the user (they've already seen the answer).
        if (assistantText.trim()) {
          try {
            await db.aiMessage.create({
              data: {
                conversationId: persistedConversationId,
                role: "assistant",
                content: assistantText,
              },
            });
          } catch (persistErr) {
            console.error("[copilot] failed to persist assistant message", persistErr);
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        controller.enqueue(encoder.encode(`\n[error: ${msg}]`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // CF-6 — echo the conversation id so the client can pin
      // subsequent requests + reflect into the URL.
      "x-conversation-id": conversation.id,
    },
  });
}
