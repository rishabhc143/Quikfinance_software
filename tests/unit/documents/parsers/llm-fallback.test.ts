import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the Anthropic SDK BEFORE importing the module under test.
// The module instantiates `new Anthropic(...)` at call time, so we
// mock the default export with a class shim whose
// `messages.create` resolves to whatever the test sets up.
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate };
      constructor(_opts: unknown) {}
    },
  };
});

import {
  isLlmFallbackEnabled,
  parseBankStatementWithLLM,
} from "@/lib/documents/parsers/llm-fallback";

/** Helper: build the Anthropic Messages response shape. */
function reply(text: string) {
  return {
    id: "msg_x",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text }],
    model: "claude-haiku-4-5",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}

const GOOD_JSON = JSON.stringify({
  bank: "HDFC",
  accountNumber: "1234",
  period: { from: "2026-04-01", to: "2026-04-30" },
  openingBalance: 10000,
  closingBalance: 17000,
  rows: [
    {
      date: "2026-04-15",
      description: "Salary credit",
      credit: 50000,
      balance: 60000,
    },
    {
      date: "2026-04-20",
      description: "RTGS to vendor",
      debit: 43000,
      balance: 17000,
    },
  ],
});

// A reasonably long extracted-text body so the size guards pass.
const SAMPLE_TEXT = "Bank statement\n".repeat(50) +
  "Account 1234\n01/04/2026 OPENING BAL 10000.00\n";

describe("lib/documents/parsers/llm-fallback", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });
  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  describe("isLlmFallbackEnabled", () => {
    it("returns true when ANTHROPIC_API_KEY is set", () => {
      process.env.ANTHROPIC_API_KEY = "anything";
      expect(isLlmFallbackEnabled()).toBe(true);
    });
    it("returns false when ANTHROPIC_API_KEY is missing", () => {
      delete process.env.ANTHROPIC_API_KEY;
      expect(isLlmFallbackEnabled()).toBe(false);
    });
  });

  describe("parseBankStatementWithLLM — gating", () => {
    it("returns null when API key is missing (no call made)", async () => {
      delete process.env.ANTHROPIC_API_KEY;
      const result = await parseBankStatementWithLLM(SAMPLE_TEXT);
      expect(result).toBeNull();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("returns null for empty input (no call made)", async () => {
      const result = await parseBankStatementWithLLM("");
      expect(result).toBeNull();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("returns null for input below the size floor (no call made)", async () => {
      const result = await parseBankStatementWithLLM("too short");
      expect(result).toBeNull();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("returns null for input above the size ceiling (no call made)", async () => {
      const huge = "x".repeat(31_000);
      const result = await parseBankStatementWithLLM(huge);
      expect(result).toBeNull();
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe("parseBankStatementWithLLM — happy path", () => {
    it("returns a parsed statement when haiku responds with valid JSON", async () => {
      mockCreate.mockResolvedValueOnce(reply(GOOD_JSON));
      const result = await parseBankStatementWithLLM(SAMPLE_TEXT);
      expect(result).not.toBeNull();
      expect(result?.bank).toBe("HDFC");
      expect(result?.rows).toHaveLength(2);
      expect(result?.rows[0]).toMatchObject({
        date: "2026-04-15",
        description: "Salary credit",
        credit: 50000,
      });
      expect(result?.rows[1]).toMatchObject({
        date: "2026-04-20",
        description: "RTGS to vendor",
        debit: 43000,
      });
      // Only ONE call — haiku succeeded.
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate.mock.calls[0][0]).toMatchObject({
        model: "claude-haiku-4-5",
      });
    });

    it("strips ```json fenced blocks the model may add", async () => {
      mockCreate.mockResolvedValueOnce(reply("```json\n" + GOOD_JSON + "\n```"));
      const result = await parseBankStatementWithLLM(SAMPLE_TEXT);
      expect(result).not.toBeNull();
      expect(result?.rows).toHaveLength(2);
    });
  });

  describe("parseBankStatementWithLLM — retry path", () => {
    it("retries with sonnet when haiku returns malformed JSON", async () => {
      mockCreate
        .mockResolvedValueOnce(reply("not json at all"))
        .mockResolvedValueOnce(reply(GOOD_JSON));
      const result = await parseBankStatementWithLLM(SAMPLE_TEXT);
      expect(result).not.toBeNull();
      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(mockCreate.mock.calls[0][0]).toMatchObject({ model: "claude-haiku-4-5" });
      expect(mockCreate.mock.calls[1][0]).toMatchObject({ model: "claude-sonnet-4-5" });
    });

    it("returns null when both retries fail", async () => {
      mockCreate.mockResolvedValue(reply("nope nope nope"));
      const result = await parseBankStatementWithLLM(SAMPLE_TEXT);
      expect(result).toBeNull();
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });

  describe("parseBankStatementWithLLM — validation", () => {
    it("rejects rows where the date isn't yyyy-MM-dd", async () => {
      const bad = JSON.stringify({
        bank: "ICICI",
        rows: [{ date: "15/04/2026", description: "x", credit: 100 }],
      });
      // Both haiku + sonnet send the same bad shape; both should fail
      // validation, so the call is retried (2 attempts) then nulled.
      mockCreate.mockResolvedValue(reply(bad));
      const result = await parseBankStatementWithLLM(SAMPLE_TEXT);
      expect(result).toBeNull();
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("rejects rows that have both debit and credit set", async () => {
      const bad = JSON.stringify({
        bank: "ICICI",
        rows: [
          { date: "2026-04-15", description: "x", debit: 100, credit: 100 },
        ],
      });
      mockCreate.mockResolvedValue(reply(bad));
      const result = await parseBankStatementWithLLM(SAMPLE_TEXT);
      expect(result).toBeNull();
    });

    it("rejects negative amounts (debit / credit must be positive)", async () => {
      const bad = JSON.stringify({
        bank: "ICICI",
        rows: [{ date: "2026-04-15", description: "x", credit: -100 }],
      });
      mockCreate.mockResolvedValue(reply(bad));
      const result = await parseBankStatementWithLLM(SAMPLE_TEXT);
      expect(result).toBeNull();
    });

    it("returns null when the model returns rows=[]", async () => {
      const empty = JSON.stringify({ bank: "UNKNOWN", rows: [] });
      // Empty rows on haiku → retry sonnet. Both return empty.
      mockCreate.mockResolvedValue(reply(empty));
      const result = await parseBankStatementWithLLM(SAMPLE_TEXT);
      expect(result).toBeNull();
    });
  });

  describe("parseBankStatementWithLLM — error path", () => {
    it("returns null when the API throws (network / auth / rate-limit)", async () => {
      mockCreate.mockRejectedValue(new Error("503 service_unavailable"));
      const result = await parseBankStatementWithLLM(SAMPLE_TEXT);
      expect(result).toBeNull();
      // Both retries hit the same error path; still capped at 2.
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });
});
