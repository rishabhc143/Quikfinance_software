import { describe, it, expect } from "vitest";
import {
  evalCondition,
  matchesRule,
  firstMatchingRule,
  type BankLineFacts,
  type RuleInput,
} from "@/lib/banking/rule-engine";

/**
 * Tests for BNK-E rule engine.
 *
 * Pure functions — no DB. The engine is direction-agnostic (CREDIT
 * vs DEBIT is checked elsewhere). All text comparisons normalise to
 * trimmed/lowercased; numeric comparisons use abs() so signed amount
 * conventions don't trip the rule.
 */

const LINE: BankLineFacts = {
  description: "AWS Cloud Services charge ref 12345",
  reference: "REF-001",
  amount: 2400,
  type: "DEBIT",
};

describe("evalCondition — text operators", () => {
  it("CONTAINS matches a substring (case-insensitive)", () => {
    expect(
      evalCondition(LINE, { field: "DESCRIPTION", op: "CONTAINS", value: "aws" })
    ).toBe(true);
  });
  it("CONTAINS rejects when the substring isn't present", () => {
    expect(
      evalCondition(LINE, { field: "DESCRIPTION", op: "CONTAINS", value: "stripe" })
    ).toBe(false);
  });
  it("STARTS_WITH matches the prefix (case-insensitive)", () => {
    expect(
      evalCondition(LINE, { field: "DESCRIPTION", op: "STARTS_WITH", value: "AWS" })
    ).toBe(true);
    expect(
      evalCondition(LINE, { field: "DESCRIPTION", op: "STARTS_WITH", value: "Cloud" })
    ).toBe(false);
  });
  it("EQUALS matches the full value (trimmed, case-insensitive)", () => {
    expect(
      evalCondition(LINE, { field: "REFERENCE", op: "EQUALS", value: "ref-001" })
    ).toBe(true);
    expect(
      evalCondition(LINE, { field: "REFERENCE", op: "EQUALS", value: "REF" })
    ).toBe(false);
  });
  it("IS_EMPTY treats null / whitespace as empty", () => {
    const empty: BankLineFacts = { ...LINE, reference: null };
    expect(
      evalCondition(empty, { field: "REFERENCE", op: "IS_EMPTY", value: "" })
    ).toBe(true);
    const blank: BankLineFacts = { ...LINE, reference: "   " };
    expect(
      evalCondition(blank, { field: "REFERENCE", op: "IS_EMPTY", value: "" })
    ).toBe(true);
    expect(
      evalCondition(LINE, { field: "REFERENCE", op: "IS_EMPTY", value: "" })
    ).toBe(false);
  });
  it("non-IS_EMPTY text op with empty value returns false (no accidental matches)", () => {
    expect(
      evalCondition(LINE, { field: "DESCRIPTION", op: "CONTAINS", value: "" })
    ).toBe(false);
  });
});

describe("evalCondition — numeric operators", () => {
  it("EQ matches with 4-decimal tolerance", () => {
    expect(
      evalCondition(LINE, { field: "AMOUNT", op: "EQ", value: "2400" })
    ).toBe(true);
    expect(
      evalCondition(LINE, { field: "AMOUNT", op: "EQ", value: "2400.00001" })
    ).toBe(true);
    expect(
      evalCondition(LINE, { field: "AMOUNT", op: "EQ", value: "2401" })
    ).toBe(false);
  });
  it("GT / LT / GTE / LTE work on absolute amount", () => {
    expect(
      evalCondition(LINE, { field: "AMOUNT", op: "GT", value: "1000" })
    ).toBe(true);
    expect(
      evalCondition(LINE, { field: "AMOUNT", op: "LT", value: "5000" })
    ).toBe(true);
    expect(
      evalCondition(LINE, { field: "AMOUNT", op: "GTE", value: "2400" })
    ).toBe(true);
    expect(
      evalCondition(LINE, { field: "AMOUNT", op: "LTE", value: "2400" })
    ).toBe(true);
  });
  it("invalid numeric value never matches", () => {
    expect(
      evalCondition(LINE, { field: "AMOUNT", op: "GT", value: "not a number" })
    ).toBe(false);
  });
  it("signed amount is normalised to abs() so DEBIT lines match positive thresholds", () => {
    const negative: BankLineFacts = { ...LINE, amount: -2400 };
    expect(
      evalCondition(negative, { field: "AMOUNT", op: "EQ", value: "2400" })
    ).toBe(true);
  });
});

describe("evalCondition — guardrails for misconfigured ops", () => {
  it("text op on AMOUNT field returns false (caught at validation, not throw)", () => {
    expect(
      evalCondition(LINE, { field: "AMOUNT", op: "CONTAINS", value: "anything" })
    ).toBe(false);
  });
  it("numeric op on text field returns false", () => {
    expect(
      evalCondition(LINE, { field: "DESCRIPTION", op: "GT", value: "100" })
    ).toBe(false);
  });
});

describe("matchesRule — combinators", () => {
  it("AND requires all conditions", () => {
    const rule: RuleInput = {
      combinator: "AND",
      conditions: [
        { field: "DESCRIPTION", op: "CONTAINS", value: "aws" },
        { field: "AMOUNT", op: "GT", value: "1000" },
      ],
    };
    expect(matchesRule(LINE, rule)).toBe(true);
  });
  it("AND fails when any condition fails", () => {
    const rule: RuleInput = {
      combinator: "AND",
      conditions: [
        { field: "DESCRIPTION", op: "CONTAINS", value: "aws" },
        { field: "AMOUNT", op: "GT", value: "5000" }, // ✗
      ],
    };
    expect(matchesRule(LINE, rule)).toBe(false);
  });
  it("OR matches when any condition matches", () => {
    const rule: RuleInput = {
      combinator: "OR",
      conditions: [
        { field: "DESCRIPTION", op: "CONTAINS", value: "stripe" }, // ✗
        { field: "AMOUNT", op: "EQ", value: "2400" }, // ✓
      ],
    };
    expect(matchesRule(LINE, rule)).toBe(true);
  });
  it("empty conditions list returns false (never blanket-fires)", () => {
    expect(
      matchesRule(LINE, { combinator: "AND", conditions: [] })
    ).toBe(false);
  });
});

describe("firstMatchingRule — first match wins by caller's order", () => {
  const rules: (RuleInput & { id: string })[] = [
    {
      id: "specific",
      combinator: "AND",
      conditions: [
        { field: "DESCRIPTION", op: "CONTAINS", value: "aws" },
        { field: "AMOUNT", op: "GT", value: "1000" },
      ],
    },
    {
      id: "broad",
      combinator: "AND",
      conditions: [{ field: "AMOUNT", op: "GT", value: "0" }],
    },
  ];

  it("returns the first matching rule in the supplied order", () => {
    const hit = firstMatchingRule(LINE, rules);
    expect(hit?.id).toBe("specific");
  });

  it("returns null when nothing matches", () => {
    const hit = firstMatchingRule(LINE, [
      {
        combinator: "AND",
        conditions: [{ field: "DESCRIPTION", op: "EQUALS", value: "stripe" }],
      },
    ]);
    expect(hit).toBeNull();
  });

  it("respects the caller's priority ordering (broad first → broad wins)", () => {
    const reordered = [rules[1], rules[0]];
    const hit = firstMatchingRule(LINE, reordered);
    expect(hit?.id).toBe("broad");
  });
});
