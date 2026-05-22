import { describe, it, expect } from "vitest";
import {
  computeBankStatementConfidence,
  confidenceBadgeClass,
  confidenceLabel,
} from "@/lib/documents/bank-statement-confidence";
import type {
  ParsedBankStatement,
  BankTransactionRow,
} from "@/lib/documents/parsers/bank-statement-types";

function makeStatement(
  rows: BankTransactionRow[],
  extras: Partial<ParsedBankStatement> = {}
): ParsedBankStatement {
  return {
    bank: "HDFC",
    rows,
    ...extras,
  };
}

describe("documents/bank-statement-confidence", () => {
  describe("null / empty edge cases", () => {
    it("returns low for null", () => {
      const r = computeBankStatementConfidence(null);
      expect(r.level).toBe("low");
      expect(r.score).toBe(0);
    });
    it("returns low for undefined", () => {
      const r = computeBankStatementConfidence(undefined);
      expect(r.level).toBe("low");
    });
    it("returns low for empty rows", () => {
      const r = computeBankStatementConfidence(makeStatement([]));
      expect(r.level).toBe("low");
      expect(r.signals.some((s) => s.includes("No transactions"))).toBe(true);
    });
  });

  describe("high-confidence statement (everything matches)", () => {
    const rows: BankTransactionRow[] = Array.from({ length: 25 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, "0")}`,
      description: `Txn ${i + 1}`,
      ...(i % 2 === 0 ? { credit: 1000 } : { debit: 500 }),
      balance: undefined,
    }));
    // 13 credits × 1000 = 13,000; 12 debits × 500 = 6,000
    // expected diff = 13000 - 6000 = 7000
    // opening 50,000 → closing 57,000
    const statement = makeStatement(rows, {
      bank: "HDFC",
      accountNumber: "50100123456789",
      period: { from: "2026-04-01", to: "2026-04-30" },
      openingBalance: 50000,
      closingBalance: 57000,
    });

    it("scores high (≥ 75)", () => {
      const r = computeBankStatementConfidence(statement);
      expect(r.score).toBeGreaterThanOrEqual(75);
      expect(r.level).toBe("high");
    });

    it("flags the balance roll match", () => {
      const r = computeBankStatementConfidence(statement);
      expect(r.signals.some((s) => s.toLowerCase().includes("balance roll matches"))).toBe(true);
    });

    it("captures bank, period, account number signals", () => {
      const r = computeBankStatementConfidence(statement);
      expect(r.signals.some((s) => s.includes("HDFC"))).toBe(true);
      expect(r.signals.some((s) => s.toLowerCase().includes("account number"))).toBe(true);
      expect(r.signals.some((s) => s.toLowerCase().includes("statement period"))).toBe(true);
    });
  });

  describe("medium-confidence statement (rows but no balance reconciliation)", () => {
    const rows: BankTransactionRow[] = Array.from({ length: 10 }, (_, i) => ({
      date: `2026-04-${String(i + 1).padStart(2, "0")}`,
      description: `Txn ${i + 1}`,
      debit: 100,
    }));
    const statement = makeStatement(rows, {
      bank: "ICICI",
      accountNumber: "1234567890",
      period: { from: "2026-04-01", to: "2026-04-30" },
      // No opening/closing balances
    });

    it("scores in the medium band (50-74)", () => {
      const r = computeBankStatementConfidence(statement);
      expect(r.score).toBeGreaterThanOrEqual(50);
      expect(r.score).toBeLessThan(75);
      expect(r.level).toBe("medium");
    });

    it("notes that balance roll couldn't be verified", () => {
      const r = computeBankStatementConfidence(statement);
      expect(
        r.signals.some((s) => s.toLowerCase().includes("balance roll"))
      ).toBe(true);
    });
  });

  describe("low-confidence statement (balance mismatch)", () => {
    // Rows say credit minus debit = +1000 but opening to closing says +5000
    const rows: BankTransactionRow[] = [
      { date: "2026-04-01", description: "x", credit: 1000 },
    ];
    const statement = makeStatement(rows, {
      bank: "HDFC",
      openingBalance: 10000,
      closingBalance: 15000,
    });

    it("penalises balance mismatch", () => {
      const r = computeBankStatementConfidence(statement);
      expect(
        r.signals.some((s) => s.toLowerCase().includes("balance roll mismatch"))
      ).toBe(true);
    });
  });

  describe("UNKNOWN bank", () => {
    const statement = makeStatement(
      [
        { date: "2026-04-01", description: "x", debit: 100 },
        { date: "2026-04-02", description: "y", credit: 200 },
      ],
      { bank: "UNKNOWN" }
    );
    it("doesn't get the bank-detected boost", () => {
      const r = computeBankStatementConfidence(statement);
      expect(r.signals.every((s) => !s.includes("Bank detected"))).toBe(true);
    });
  });

  describe("score clamping", () => {
    it("clamps to 0-100", () => {
      const r = computeBankStatementConfidence(
        makeStatement(
          Array.from({ length: 100 }, () => ({
            date: "2026-04-01",
            description: "x",
            credit: 100,
          })),
          {
            bank: "HDFC",
            accountNumber: "x",
            period: { from: "2026-04-01", to: "2026-04-30" },
            openingBalance: 0,
            closingBalance: 10000,
          }
        )
      );
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("UI helpers", () => {
    it("confidenceBadgeClass returns distinct classes per level", () => {
      expect(confidenceBadgeClass("high")).toContain("emerald");
      expect(confidenceBadgeClass("medium")).toContain("amber");
      expect(confidenceBadgeClass("low")).toContain("rose");
    });
    it("confidenceLabel returns human-readable text", () => {
      expect(confidenceLabel("high")).toContain("High");
      expect(confidenceLabel("medium")).toContain("Medium");
      expect(confidenceLabel("low")).toContain("Low");
    });
  });
});
