/**
 * Anthropic model pricing (USD per million tokens) — Aug 2025 list.
 * Cents-per-token math is integer to avoid float drift when we
 * accumulate hundreds of small calls into the daily aggregate.
 *
 * 1 USD = 100 cents. Storing cost as integer cents in the DB.
 *
 *   Sonnet 4.5 input  = 3.00 USD / 1M = 300 cents / 1M tokens
 *   Sonnet 4.5 output = 15.00 USD / 1M = 1500 cents / 1M tokens
 *
 * If pricing ever rounds to fractions-of-a-cent per token, the
 * helpers round up so we never under-bill ourselves.
 */

type Pricing = {
  /** Input cost in cents per million tokens. */
  inputCentsPerMTok: number;
  /** Output cost in cents per million tokens. */
  outputCentsPerMTok: number;
};

const PRICING: Record<string, Pricing> = {
  "claude-sonnet-4-5": { inputCentsPerMTok: 300, outputCentsPerMTok: 1500 },
  "claude-haiku-4-5": { inputCentsPerMTok: 80, outputCentsPerMTok: 400 },
  // Fallback for any model alias we haven't priced yet — assume
  // Sonnet rates so we over-estimate rather than under-estimate.
  default: { inputCentsPerMTok: 300, outputCentsPerMTok: 1500 },
};

export function pricingFor(model: string): Pricing {
  // Normalise dated aliases ("claude-sonnet-4-5-20250929" → base).
  const base = model.replace(/-\d{8}$/, "");
  return PRICING[base] ?? PRICING[model] ?? PRICING.default;
}

/** Compute cost in integer cents for a given token usage on a
 *  given model. Rounds up so we never under-bill. */
export function calcCostCents(
  model: string,
  tokensIn: number,
  tokensOut: number
): number {
  const p = pricingFor(model);
  const inCost = Math.ceil((tokensIn * p.inputCentsPerMTok) / 1_000_000);
  const outCost = Math.ceil((tokensOut * p.outputCentsPerMTok) / 1_000_000);
  return inCost + outCost;
}
