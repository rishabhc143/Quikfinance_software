import { describe, it, expect } from "vitest";
import { calcCostCents, pricingFor } from "@/lib/llm/pricing";

describe("pricingFor", () => {
  it("returns Sonnet 4.5 rates", () => {
    const p = pricingFor("claude-sonnet-4-5");
    expect(p.inputCentsPerMTok).toBe(300);
    expect(p.outputCentsPerMTok).toBe(1500);
  });

  it("returns Haiku 4.5 rates", () => {
    const p = pricingFor("claude-haiku-4-5");
    expect(p.inputCentsPerMTok).toBe(80);
    expect(p.outputCentsPerMTok).toBe(400);
  });

  it("normalises dated aliases (claude-sonnet-4-5-20250929 → claude-sonnet-4-5)", () => {
    const p = pricingFor("claude-sonnet-4-5-20250929");
    expect(p.inputCentsPerMTok).toBe(300);
  });

  it("falls through to Sonnet rates on unknown model (over-bill safe)", () => {
    const p = pricingFor("claude-future-7");
    expect(p.inputCentsPerMTok).toBe(300);
    expect(p.outputCentsPerMTok).toBe(1500);
  });
});

describe("calcCostCents", () => {
  it("computes exact cost for round numbers", () => {
    // 1M input + 1M output on Sonnet 4.5 = 300 + 1500 = 1800 cents
    expect(calcCostCents("claude-sonnet-4-5", 1_000_000, 1_000_000)).toBe(1800);
  });

  it("rounds up on fractional tokens so we never under-bill", () => {
    // 1 input token on Sonnet = 0.0003 cents → ceil to 1 cent
    expect(calcCostCents("claude-sonnet-4-5", 1, 0)).toBe(1);
    expect(calcCostCents("claude-sonnet-4-5", 0, 1)).toBe(1);
  });

  it("returns zero for zero tokens", () => {
    expect(calcCostCents("claude-sonnet-4-5", 0, 0)).toBe(0);
  });

  it("handles Haiku at lower rate", () => {
    // Haiku: 1M input = 80 cents; 1M output = 400 cents → 480 total
    expect(calcCostCents("claude-haiku-4-5", 1_000_000, 1_000_000)).toBe(480);
  });
});
