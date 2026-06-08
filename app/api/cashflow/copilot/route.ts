import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrganization } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { COPILOT_TOOLS, runTool } from "@/lib/cashflow/copilot-tools";
import {
  GuardrailError,
  PROMPT_INJECTION_GUARD,
  assertWithinBudget,
  assertWithinRateLimit,
  recordLlmCall,
} from "@/lib/llm/guardrails";

export const runtime = "nodejs";
// CF-5 hotfix: the agentic loop (Claude call → tool → Claude call again)
// easily runs 15–30s with tool use. Vercel's default function timeout
// is 10s on Hobby, which was killing the stream mid-flight and leaving
// the client's "Thinking…" spinner stuck forever. 60s is the Hobby
// ceiling and comfortably covers a 6-turn agentic conversation.
export const maxDuration = 60;

/**
 * CF-5 — CFO Copilot endpoint.
 *
 * Receives a multi-turn chat transcript, hands it to Claude Sonnet
 * 4.5 with the read-only cashflow / AR / AP tool kit, and streams
 * the response as plain text. Tool calls are executed server-side
 * inside the agentic loop (max 6 turns) and their results are fed
 * back into Claude until it produces a final text answer.
 *
 * Guardrails (Phase 8 Sprint 2):
 *   • Per-user rate limit (100 messages/day) — assertWithinRateLimit
 *   • Per-org daily token budget — assertWithinBudget
 *   • Abort signal — req.signal threaded into anthropic.messages.create
 *   • Audit log of every call — recordLlmCall stores tokens, latency,
 *     model, stopReason on the AiMessage row + upserts daily org usage
 *   • Prompt-injection hardening — PROMPT_INJECTION_GUARD prepended
 *     to the system prompt
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
  conversationId: z.string().optional(),
});

const SYSTEM_PROMPT = (orgName: string, currency: string) => `\
${PROMPT_INJECTION_GUARD}

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

const MODEL = "claude-sonnet-4-5";

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

  // ── Guardrail pre-flight ────────────────────────────────────
  try {
    await assertWithinRateLimit({
      organizationId: organization.id,
      userId: user.id,
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

  // ── Resolve / create conversation ───────────────────────────
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
  const conversationId = conversation.id;

  // Persist user message before LLM call so it's safely in DB even
  // if streaming fails. User messages don't carry telemetry (the
  // LLM hasn't run yet) so we write them directly.
  const lastUser = parsed.data.messages.filter((m) => m.role === "user").at(-1);
  if (lastUser) {
    await db.aiMessage.create({
      data: {
        conversationId,
        role: "user",
        content: lastUser.content,
      },
    });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  // Telemetry accumulators across all agentic-loop turns. Recorded
  // once at the end as a single AiMessage + OrganizationAIUsage row.
  let assistantText = "";
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let lastStopReason = "unknown";
  const startedAt = Date.now();

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
          // Guardrail 4: forward the request abort signal so closing
          // the browser tab stops generation + billing immediately.
          const response = await anthropic.messages.create(
            {
              model: MODEL,
              max_tokens: 2048,
              system: SYSTEM_PROMPT(organization.name, organization.currency),
              tools: COPILOT_TOOLS as unknown as Anthropic.Tool[],
              messages,
            },
            { signal: req.signal }
          );

          // Accumulate token usage from EVERY turn — Anthropic bills
          // each call independently.
          totalTokensIn += response.usage?.input_tokens ?? 0;
          totalTokensOut += response.usage?.output_tokens ?? 0;
          lastStopReason = response.stop_reason ?? "unknown";

          for (const block of response.content) {
            if (block.type === "text") {
              assistantText += block.text;
              controller.enqueue(encoder.encode(block.text));
            }
          }

          if (response.stop_reason === "tool_use") {
            messages.push({
              role: "assistant",
              content: response.content,
            });

            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const block of response.content) {
              if (block.type !== "tool_use") continue;
              try {
                // Mutating tools (propose_*) need user + conversation
                // context to attribute the proposed action. Pass
                // for all tools — read-only ones ignore it.
                const result = await runTool(
                  organization.id,
                  organization.currency,
                  block.name,
                  block.input as Record<string, unknown>,
                  { userId: user.id, conversationId }
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
            continue;
          }

          break;
        }
        controller.close();
      } catch (err) {
        // Abort = client closed tab. Treat as a normal completion
        // with a special stopReason — still record what we generated
        // so it's auditable + counted toward budget.
        if (req.signal.aborted) {
          lastStopReason = "abort";
        } else {
          const msg = err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(encoder.encode(`\n[error: ${msg}]`));
        }
        controller.close();
      }

      // Always record the call (even on partial / aborted streams)
      // so token spend is accurately attributed. Try/catch so a DB
      // hiccup at the end doesn't surface to the user — they've
      // already seen the answer (or the error).
      const latencyMs = Date.now() - startedAt;
      if (totalTokensIn > 0 || totalTokensOut > 0 || assistantText.trim()) {
        try {
          await recordLlmCall({
            organizationId: organization.id,
            conversationId,
            role: "assistant",
            content: assistantText || "(empty)",
            tokensIn: totalTokensIn,
            tokensOut: totalTokensOut,
            latencyMs,
            model: MODEL,
            stopReason: lastStopReason,
          });
        } catch (persistErr) {
          console.error("[copilot] failed to record LLM call", persistErr);
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "x-conversation-id": conversationId,
    },
  });
}
