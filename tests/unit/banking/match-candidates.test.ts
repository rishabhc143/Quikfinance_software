import { describe, it, expect } from "vitest";
import {
  scoreCandidate,
  rankCandidates,
  type BankLine,
  type Candidate,
} from "@/lib/banking/match-candidates";

/**
 * Tests for BNK-C candidate scoring.
 *
 * Rubric (see lib/banking/match-candidates.ts header):
 *   Amount      : 60 / 40 / 20 / 0  (exact / 1% / 5% / off)
 *   Date        : 20 / 15 / 10 / 5 / 0  (same / 3d / 7d / 30d / off)
 *   Description : 10 / 5 / 0  (full / first-word / nothing)
 *   Direction filter: mismatch → -1 (caller drops)
 *   rankCandidates: cutoff 30, sort desc, limit 10
 */

const BANK_CREDIT: BankLine = {
  amount: 1000,
  date: new Date("2026-04-15T00:00:00Z"),
  type: "CREDIT",
  description: "ACME Corp payment ref 1234",
};

const BANK_DEBIT: BankLine = {
  amount: 1000,
  date: new Date("2026-04-15T00:00:00Z"),
  type: "DEBIT",
  description: "VENDOR-X invoice",
};

const baseInvoice: Candidate = {
  type: "INVOICE",
  id: "inv-1",
  number: "INV-2026-0042",
  counterparty: "ACME Corp",
  amount: 1000,
  date: new Date("2026-04-15T00:00:00Z"),
};

describe("scoreCandidate — amount component", () => {
  it("scores 60 for exact amount match (4-decimal tolerance)", () => {
    const c: Candidate = { ...baseInvoice, amount: 1000.0001 };
    // exact (60) + same day (20) + full-name desc (10) = 90
    expect(scoreCandidate(BANK_CREDIT, c)).toBe(90);
  });

  it("scores 40 for within-1% amount delta", () => {
    const c: Candidate = { ...baseInvoice, amount: 1005 }; // 0.5% off
    // within 1% (40) + same day (20) + full-name desc (10) = 70
    expect(scoreCandidate(BANK_CREDIT, c)).toBe(70);
  });

  it("scores 20 for within-5% amount delta", () => {
    const c: Candidate = { ...baseInvoice, amount: 1040 }; // 4% off
    // within 5% (20) + same day (20) + full-name desc (10) = 50
    expect(scoreCandidate(BANK_CREDIT, c)).toBe(50);
  });

  it("scores 0 for amount delta >5%", () => {
    const c: Candidate = { ...baseInvoice, amount: 1200 }; // 20% off
    // 0 + same day (20) + full-name desc (10) = 30
    expect(scoreCandidate(BANK_CREDIT, c)).toBe(30);
  });
});

describe("scoreCandidate — date component", () => {
  const withDate = (d: string): Candidate => ({
    ...baseInvoice,
    date: new Date(d),
    // strip description match so we isolate date
    counterparty: "XYZ Unrelated",
  });

  it("scores 20 for same day", () => {
    // exact amount (60) + same day (20) + no desc = 80
    expect(scoreCandidate(BANK_CREDIT, withDate("2026-04-15"))).toBe(80);
  });

  it("scores 15 for within 3 days", () => {
    // 60 + 15 + 0 = 75
    expect(scoreCandidate(BANK_CREDIT, withDate("2026-04-13"))).toBe(75);
  });

  it("scores 10 for within 7 days", () => {
    // 60 + 10 + 0 = 70
    expect(scoreCandidate(BANK_CREDIT, withDate("2026-04-10"))).toBe(70);
  });

  it("scores 5 for within 30 days", () => {
    // 60 + 5 + 0 = 65
    expect(scoreCandidate(BANK_CREDIT, withDate("2026-04-01"))).toBe(65);
  });

  it("scores 0 for >30 day gap", () => {
    // 60 + 0 + 0 = 60
    expect(scoreCandidate(BANK_CREDIT, withDate("2026-02-01"))).toBe(60);
  });
});

describe("scoreCandidate — description component", () => {
  it("scores 10 when counterparty appears fully in bank description", () => {
    // 60 + 20 + 10 = 90 (already covered, repeated here for clarity)
    expect(scoreCandidate(BANK_CREDIT, baseInvoice)).toBe(90);
  });

  it("scores 5 when only first word matches (>=4 chars)", () => {
    const c: Candidate = { ...baseInvoice, counterparty: "ACME Industries Pvt Ltd" };
    // 60 + 20 + 5 (first word "ACME" matches, ≥4 chars) = 85
    expect(scoreCandidate(BANK_CREDIT, c)).toBe(85);
  });

  it("scores 0 when first word is too short to be meaningful", () => {
    const c: Candidate = {
      ...baseInvoice,
      counterparty: "AB Trading",
    };
    const bank: BankLine = {
      ...BANK_CREDIT,
      description: "AB and other text here",
    };
    // 60 + 20 + 0 = 80 (first word "AB" is only 2 chars, below threshold)
    expect(scoreCandidate(bank, c)).toBe(80);
  });

  it("scores 0 when description is null", () => {
    const bank: BankLine = { ...BANK_CREDIT, description: null };
    // 60 + 20 + 0 = 80
    expect(scoreCandidate(bank, baseInvoice)).toBe(80);
  });

  it("scores 0 when counterparty is null", () => {
    const c: Candidate = { ...baseInvoice, counterparty: null };
    // 60 + 20 + 0 = 80
    expect(scoreCandidate(BANK_CREDIT, c)).toBe(80);
  });
});

describe("scoreCandidate — direction filter", () => {
  it("returns -1 for CREDIT bank line + BILL candidate (money-out)", () => {
    const c: Candidate = { ...baseInvoice, type: "BILL" };
    expect(scoreCandidate(BANK_CREDIT, c)).toBe(-1);
  });

  it("returns -1 for DEBIT bank line + INVOICE candidate (money-in)", () => {
    const c: Candidate = { ...baseInvoice, type: "INVOICE" };
    expect(scoreCandidate(BANK_DEBIT, c)).toBe(-1);
  });

  it("scores normally for DEBIT bank line + EXPENSE candidate (money-out)", () => {
    const c: Candidate = {
      ...baseInvoice,
      type: "EXPENSE",
      counterparty: "VENDOR-X",
    };
    // 60 + 20 + 10 = 90
    expect(scoreCandidate(BANK_DEBIT, c)).toBe(90);
  });
});

describe("rankCandidates", () => {
  it("drops candidates below cutoff (default 30)", () => {
    const candidates: Candidate[] = [
      { ...baseInvoice, id: "a", counterparty: "XYZ", amount: 1200, date: new Date("2026-02-01") }, // 0+0+0 = 0
      { ...baseInvoice, id: "b" }, // 90
    ];
    const ranked = rankCandidates(BANK_CREDIT, candidates);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].id).toBe("b");
  });

  it("sorts by score descending", () => {
    const candidates: Candidate[] = [
      { ...baseInvoice, id: "low", amount: 1040 }, // within 5% → 20+20+10 = 50
      { ...baseInvoice, id: "high" }, // exact → 90
      { ...baseInvoice, id: "mid", amount: 1005 }, // within 1% → 40+20+10 = 70
    ];
    const ranked = rankCandidates(BANK_CREDIT, candidates);
    expect(ranked.map((c) => c.id)).toEqual(["high", "mid", "low"]);
  });

  it("filters out direction-mismatched candidates", () => {
    const candidates: Candidate[] = [
      { ...baseInvoice, id: "ok" }, // INVOICE + CREDIT → ok
      { ...baseInvoice, id: "wrong", type: "BILL" }, // BILL + CREDIT → -1
    ];
    const ranked = rankCandidates(BANK_CREDIT, candidates);
    expect(ranked.map((c) => c.id)).toEqual(["ok"]);
  });

  it("caps at limit (default 10)", () => {
    const candidates: Candidate[] = Array.from({ length: 15 }, (_, i) => ({
      ...baseInvoice,
      id: `c-${i}`,
    }));
    const ranked = rankCandidates(BANK_CREDIT, candidates);
    expect(ranked).toHaveLength(10);
  });

  it("respects custom cutoff + limit overrides", () => {
    const candidates: Candidate[] = [
      { ...baseInvoice, id: "exact" }, // 90
      { ...baseInvoice, id: "weak", amount: 1040, counterparty: "XYZ" }, // 20+20+0 = 40
    ];
    const ranked = rankCandidates(BANK_CREDIT, candidates, { cutoff: 50, limit: 5 });
    expect(ranked.map((c) => c.id)).toEqual(["exact"]);
  });
});
