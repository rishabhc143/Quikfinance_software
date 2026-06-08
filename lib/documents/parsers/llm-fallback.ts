/**
 * DOC-D4.4: Claude-API fallback for unknown / unparseable bank
 * statement layouts.
 *
 * When the heuristic per-bank parsers (HDFC / ICICI / Axis / SBI /
 * Kotak / IDFC) can't recognise a layout — either because the bank
 * is one we haven't templated yet, or because the bank changed its
 * statement format — we fall back to Claude Haiku to extract the
 * rows. This is the ONLY paid feature in the Documents module.
 *
 * Cost: ~₹0.85 (~$0.01) per statement on claude-haiku-4-5.
 *
 * Feature gate: `ANTHROPIC_API_KEY` must be set in the environment.
 * The caller checks `isLlmFallbackEnabled()` before calling
 * `parseBankStatementWithLLM()` — free deploys without the key
 * never hit Anthropic and the existing free flow stays
 * fully functional.
 *
 * Fail-open: every error path returns `null`. The upload pipeline
 * treats `null` the same as "heuristic couldn't read this layout" —
 * the user sees the extracted-text panel and can either re-upload
 * or wait for us to ship a template parser.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type {
  BankTransactionRow,
  ParsedBankStatement,
} from "./bank-statement-types";
import {
  GuardrailError,
  assertWithinBudget,
  recordLlmUsage,
} from "@/lib/llm/guardrails";

/** Input size guard. Below 200 chars there's no real statement to
 *  parse; above 30 kB the prompt cost balloons and we'd risk hitting
 *  context-window limits. */
const MIN_TEXT_CHARS = 200;
const MAX_TEXT_CHARS = 30_000;

/** Hard truncation before sending to the model — leaves a safety
 *  buffer below the model's 200k context. */
const MAX_PROMPT_TEXT_CHARS = 25_000;

const HAIKU_MODEL = "claude-haiku-4-5";
const SONNET_MODEL = "claude-sonnet-4-5";

const SYSTEM_PROMPT = `You are a bank-statement parser. The user will paste the raw extracted text of an Indian bank statement PDF. Your job is to return STRICT JSON that matches this shape exactly:

{
  "bank": "HDFC" | "ICICI" | "AXIS" | "SBI" | "KOTAK" | "IDFC" | "UNKNOWN",
  "accountNumber": "<string, optional — last 4 digits OK if redacted>",
  "period": { "from": "yyyy-MM-dd", "to": "yyyy-MM-dd" }   // optional
  "openingBalance": <number, optional>,
  "closingBalance": <number, optional>,
  "rows": [
    {
      "date": "yyyy-MM-dd",
      "description": "<string>",
      "debit": <positive number, optional>,
      "credit": <positive number, optional>,
      "balance": <number, optional>
    }
  ]
}

Rules:
- Indian rupees. Strip currency symbols and commas. Use plain numbers, not strings.
- Dates MUST be ISO yyyy-MM-dd. Indian banks usually print dd/MM/yyyy or dd-MM-yyyy — convert.
- A row has EITHER \`debit\` OR \`credit\`, never both. Money out of the account is debit. Money in is credit.
- Omit fields you can't determine — don't guess.
- Output ONLY the JSON object. No prose. No markdown fences. No commentary.
- If the input clearly isn't a bank statement, return: {"bank": "UNKNOWN", "rows": []}`;

/** zod schema mirroring `ParsedBankStatement` for validation. */
const RowSchema = z
  .object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be yyyy-MM-dd"),
    description: z.string().min(1).max(500),
    debit: z.number().positive().optional(),
    credit: z.number().positive().optional(),
    balance: z.number().optional(),
    mode: z.string().max(50).optional(),
    reference: z.string().max(120).optional(),
  })
  .refine((r) => !(r.debit != null && r.credit != null), {
    message: "a row cannot have both debit and credit",
  });

const ResponseSchema = z.object({
  bank: z.enum(["HDFC", "ICICI", "AXIS", "SBI", "KOTAK", "IDFC", "UNKNOWN"]),
  accountNumber: z.string().max(60).optional(),
  period: z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
  openingBalance: z.number().optional(),
  closingBalance: z.number().optional(),
  rows: z.array(RowSchema).max(2000),
});

/** Are we configured to call Anthropic? Cheap to check; the
 *  upload + retry actions guard on this before paying the round
 *  trip. */
export function isLlmFallbackEnabled(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Calls Claude to parse a bank statement. Returns null on any
 * failure (missing env var, oversize text, model error, JSON parse
 * failure, schema validation failure, or both retries exhausted).
 *
 * Up to 2 calls: first to haiku for cost, then if the response
 * doesn't validate, one retry with sonnet for accuracy.
 *
 * When `organizationId` is provided, the call is gated by the
 * per-org daily token budget (Guardrail 2) and the spend is
 * recorded into OrganizationAIUsage (Guardrail 3 dashboard). When
 * absent (legacy callsite, tests), the call still runs but isn't
 * billed against any org — keep new callers always passing org.
 */
export async function parseBankStatementWithLLM(
  text: string | null | undefined,
  organizationId?: string
): Promise<ParsedBankStatement | null> {
  if (!isLlmFallbackEnabled()) return null;
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.length < MIN_TEXT_CHARS) return null;
  if (trimmed.length > MAX_TEXT_CHARS) return null;

  // Guardrail pre-flight (skipped when no org context).
  if (organizationId) {
    try {
      await assertWithinBudget({ organizationId });
    } catch (e) {
      if (e instanceof GuardrailError) {
        console.warn(
          `[llm-fallback] org ${organizationId} over daily token budget — falling back to extracted-text panel`
        );
        return null;
      }
      throw e;
    }
  }

  const promptText =
    trimmed.length > MAX_PROMPT_TEXT_CHARS
      ? trimmed.slice(0, MAX_PROMPT_TEXT_CHARS)
      : trimmed;

  // First attempt: haiku (cheap).
  let parsed = await callClaude(HAIKU_MODEL, promptText, organizationId);
  if (parsed) return parsed;

  // Second attempt: sonnet (more accurate, ~5x cost). Cap at 2
  // total calls per statement.
  parsed = await callClaude(SONNET_MODEL, promptText, organizationId);
  return parsed;
}

/**
 * One call to the Anthropic API. Validates the response and
 * returns the parsed structure, or `null` on any failure.
 *
 * Exposed for testing (so the test can mock `Anthropic` once and
 * confirm both haiku+sonnet attempts get the same prompt shape).
 */
async function callClaude(
  model: string,
  text: string,
  organizationId?: string
): Promise<ParsedBankStatement | null> {
  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }],
    });

    // Guardrail 5/3: record spend even on failure paths below so
    // the dashboard reflects what Anthropic actually charged us.
    // Wrapped in try/catch so a DB hiccup doesn't break parsing.
    if (organizationId && response.usage) {
      try {
        await recordLlmUsage({
          organizationId,
          tokensIn: response.usage.input_tokens ?? 0,
          tokensOut: response.usage.output_tokens ?? 0,
          model,
        });
      } catch (usageErr) {
        console.warn(
          "[llm-fallback] failed to record usage",
          usageErr
        );
      }
    }

    // Aggregate every text block in the response.
    const raw = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    if (!raw) return null;

    // Strip markdown fences in case the model includes them despite
    // the instruction.
    const stripped = stripJsonFences(raw);

    let json: unknown;
    try {
      json = JSON.parse(stripped);
    } catch {
      return null;
    }

    const result = ResponseSchema.safeParse(json);
    if (!result.success) {
      console.warn(
        "[llm-fallback] response failed validation",
        result.error.flatten()
      );
      return null;
    }

    // Empty rows = parser had nothing useful to give us. Treat as
    // null so the caller falls back to extracted-text panel.
    if (result.data.rows.length === 0) return null;

    // The schema enforces debit XOR credit on each row already; the
    // type system already says these fields are optional + positive.
    const rows: BankTransactionRow[] = result.data.rows.map((r) => ({
      date: r.date,
      description: r.description,
      ...(r.debit != null ? { debit: r.debit } : {}),
      ...(r.credit != null ? { credit: r.credit } : {}),
      ...(r.balance != null ? { balance: r.balance } : {}),
      ...(r.mode ? { mode: r.mode } : {}),
      ...(r.reference ? { reference: r.reference } : {}),
    }));

    return {
      bank: result.data.bank,
      ...(result.data.accountNumber
        ? { accountNumber: result.data.accountNumber }
        : {}),
      ...(result.data.period ? { period: result.data.period } : {}),
      ...(result.data.openingBalance != null
        ? { openingBalance: result.data.openingBalance }
        : {}),
      ...(result.data.closingBalance != null
        ? { closingBalance: result.data.closingBalance }
        : {}),
      rows,
    };
  } catch (err) {
    console.warn(`[llm-fallback] ${model} call failed`, err);
    return null;
  }
}

/** Strip ```json ... ``` markdown fences if the model added them
 *  despite the system prompt. Also strips a leading "json" tag and
 *  any leading/trailing whitespace. */
function stripJsonFences(raw: string): string {
  let s = raw.trim();
  // Triple-backtick fenced block.
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) s = fenced[1].trim();
  return s;
}
