import { describe, it, expect } from "vitest";
import {
  buildBankStatementParseError,
  defaultParseErrorReason,
} from "@/lib/documents/parse-error";

describe("buildBankStatementParseError", () => {
  it("returns the expected sentinel shape", () => {
    const reason = "Couldn't parse this layout.";
    const result = buildBankStatementParseError(reason);
    expect(result).toEqual({
      bank: "UNKNOWN",
      rows: [],
      _meta: { parserSource: "heuristic", parseError: reason },
    });
  });

  it("preserves the reason verbatim", () => {
    const long = "A very specific reason ".repeat(20);
    const result = buildBankStatementParseError(long);
    expect(result._meta?.parseError).toBe(long);
  });

  it("rows is always empty", () => {
    const result = buildBankStatementParseError("anything");
    expect(result.rows).toEqual([]);
    expect(result.rows.length).toBe(0);
  });

  it("bank is always UNKNOWN", () => {
    const result = buildBankStatementParseError("anything");
    expect(result.bank).toBe("UNKNOWN");
  });

  it("parserSource is always 'heuristic'", () => {
    const result = buildBankStatementParseError("anything");
    expect(result._meta?.parserSource).toBe("heuristic");
  });

  it("type guard isParsedBankStatement should accept the sentinel", async () => {
    // Drawer relies on isParsedBankStatement(...) passing for the
    // sentinel so the BankStatementTransactionsPanel renders + reads
    // _meta.parseError to show the hint banner.
    const { isParsedBankStatement } = await import(
      "@/lib/documents/parsers/bank-statement-types"
    );
    const sentinel = buildBankStatementParseError("test");
    expect(isParsedBankStatement(sentinel)).toBe(true);
  });
});

describe("defaultParseErrorReason", () => {
  it("returns a message mentioning AI fallback when LLM enabled", () => {
    const msg = defaultParseErrorReason(true);
    expect(msg).toMatch(/AI fallback/i);
    expect(msg).toMatch(/CSV/i);
  });

  it("returns a message mentioning ANTHROPIC_API_KEY when LLM disabled", () => {
    const msg = defaultParseErrorReason(false);
    expect(msg).toMatch(/ANTHROPIC_API_KEY/);
    expect(msg).toMatch(/CSV/i);
  });

  it("returns different strings for enabled vs disabled", () => {
    const enabled = defaultParseErrorReason(true);
    const disabled = defaultParseErrorReason(false);
    expect(enabled).not.toBe(disabled);
  });

  it("both messages mention 'Smart Capture'", () => {
    expect(defaultParseErrorReason(true)).toMatch(/Smart Capture/);
    expect(defaultParseErrorReason(false)).toMatch(/Smart Capture/);
  });
});
