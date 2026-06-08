import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    aiMessage: { count: vi.fn(), create: vi.fn() },
    organizationAIUsage: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    // Implement $transaction so that when it receives operations, it
    // executes the underlying mocked methods so our spies see them.
    $transaction: vi.fn().mockImplementation(async (ops: unknown[]) => ops),
  },
}));

import { db } from "@/lib/db";
import {
  DEFAULTS,
  GuardrailError,
  PROMPT_INJECTION_GUARD,
  assertWithinBudget,
  assertWithinRateLimit,
  recordLlmCall,
} from "@/lib/llm/guardrails";

const ORG = "org-1";
const USER = "user-1";
const CONV = "conv-1";

const msgCount = db.aiMessage.count as unknown as ReturnType<typeof vi.fn>;
const usageFind = db.organizationAIUsage.findUnique as unknown as ReturnType<typeof vi.fn>;
const txn = db.$transaction as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  msgCount.mockReset().mockResolvedValue(0);
  usageFind.mockReset().mockResolvedValue(null);
  txn.mockReset().mockImplementation(async (ops: unknown[]) => ops);
});

describe("assertWithinRateLimit", () => {
  it("does nothing when usage is below default limit", async () => {
    msgCount.mockResolvedValue(10);
    await expect(
      assertWithinRateLimit({ organizationId: ORG, userId: USER })
    ).resolves.toBeUndefined();
  });

  it("throws when usage equals the default limit", async () => {
    msgCount.mockResolvedValue(DEFAULTS.perUserDailyMessages);
    await expect(
      assertWithinRateLimit({ organizationId: ORG, userId: USER })
    ).rejects.toBeInstanceOf(GuardrailError);
  });

  it("respects a custom limit override", async () => {
    msgCount.mockResolvedValue(50);
    await expect(
      assertWithinRateLimit({ organizationId: ORG, userId: USER, limit: 100 })
    ).resolves.toBeUndefined();
    await expect(
      assertWithinRateLimit({ organizationId: ORG, userId: USER, limit: 50 })
    ).rejects.toThrow();
  });

  it("scopes the count query to today + this user + this org", async () => {
    await assertWithinRateLimit({ organizationId: ORG, userId: USER });
    const call = msgCount.mock.calls[0][0];
    expect(call.where.role).toBe("user");
    expect(call.where.conversation.userId).toBe(USER);
    expect(call.where.conversation.organizationId).toBe(ORG);
    expect(call.where.createdAt.gte).toBeInstanceOf(Date);
  });

  it("uses error code 'rate_limit_user'", async () => {
    msgCount.mockResolvedValue(DEFAULTS.perUserDailyMessages);
    try {
      await assertWithinRateLimit({ organizationId: ORG, userId: USER });
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(GuardrailError);
      expect((e as GuardrailError).code).toBe("rate_limit_user");
    }
  });
});

describe("assertWithinBudget", () => {
  it("does nothing when no usage row exists yet (first call of day)", async () => {
    usageFind.mockResolvedValue(null);
    await expect(assertWithinBudget({ organizationId: ORG })).resolves.toBeUndefined();
  });

  it("does nothing when both inputs + outputs are below budget", async () => {
    usageFind.mockResolvedValue({
      tokensIn: 100,
      tokensOut: 50,
    });
    await expect(assertWithinBudget({ organizationId: ORG })).resolves.toBeUndefined();
  });

  it("throws budget_tokens_in when input is at the limit", async () => {
    usageFind.mockResolvedValue({
      tokensIn: DEFAULTS.perOrgDailyTokensIn,
      tokensOut: 0,
    });
    try {
      await assertWithinBudget({ organizationId: ORG });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as GuardrailError).code).toBe("budget_tokens_in");
    }
  });

  it("throws budget_tokens_out when output is at the limit", async () => {
    usageFind.mockResolvedValue({
      tokensIn: 0,
      tokensOut: DEFAULTS.perOrgDailyTokensOut,
    });
    try {
      await assertWithinBudget({ organizationId: ORG });
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as GuardrailError).code).toBe("budget_tokens_out");
    }
  });

  it("respects custom limit overrides", async () => {
    usageFind.mockResolvedValue({ tokensIn: 5000, tokensOut: 1000 });
    await expect(
      assertWithinBudget({
        organizationId: ORG,
        tokensInLimit: 10000,
        tokensOutLimit: 2000,
      })
    ).resolves.toBeUndefined();
    await expect(
      assertWithinBudget({
        organizationId: ORG,
        tokensInLimit: 5000, // exactly at the threshold
        tokensOutLimit: 2000,
      })
    ).rejects.toThrow();
  });
});

describe("recordLlmCall", () => {
  it("writes both AiMessage and OrganizationAIUsage in one transaction", async () => {
    await recordLlmCall({
      organizationId: ORG,
      conversationId: CONV,
      role: "assistant",
      content: "Test response",
      tokensIn: 1000,
      tokensOut: 500,
      latencyMs: 1234,
      model: "claude-sonnet-4-5",
      stopReason: "end_turn",
    });
    expect(txn).toHaveBeenCalledTimes(1);
  });

  it("computes cost in cents from token counts (upsert receives correct cost)", async () => {
    const upsertSpy = db.organizationAIUsage.upsert as unknown as ReturnType<typeof vi.fn>;
    upsertSpy.mockReset();
    await recordLlmCall({
      organizationId: ORG,
      conversationId: CONV,
      role: "assistant",
      content: "x",
      tokensIn: 1_000_000, // exactly 1M input
      tokensOut: 1_000_000, // exactly 1M output
      latencyMs: 100,
      model: "claude-sonnet-4-5",
      stopReason: "end_turn",
    });
    // Sonnet 4.5: 1M input = 300 cents, 1M output = 1500 cents → 1800 total
    expect(upsertSpy).toHaveBeenCalledTimes(1);
    const args = upsertSpy.mock.calls[0][0];
    expect(args.create.costCents).toBe(1800);
    expect(args.update.costCents.increment).toBe(1800);
  });
});

describe("PROMPT_INJECTION_GUARD", () => {
  it("mentions user input is data not instructions", () => {
    expect(PROMPT_INJECTION_GUARD.toLowerCase()).toContain("data");
    expect(PROMPT_INJECTION_GUARD.toLowerCase()).toContain("not instructions");
  });

  it("explicitly names common jailbreak patterns to defend against", () => {
    expect(PROMPT_INJECTION_GUARD).toMatch(/ignore previous instructions/i);
    expect(PROMPT_INJECTION_GUARD).toMatch(/system prompt/i);
    expect(PROMPT_INJECTION_GUARD).toMatch(/reveal your system prompt/i);
  });

  it("instructs Claude to anchor on the system prompt", () => {
    expect(PROMPT_INJECTION_GUARD).toMatch(/system prompt only/i);
  });
});
