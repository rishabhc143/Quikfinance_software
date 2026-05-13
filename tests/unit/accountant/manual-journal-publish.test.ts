import { describe, it, expect } from "vitest";
import {
  flipDrCrLines,
  manualJournalReference,
  manualJournalReverseReference,
} from "@/lib/accounting/manual-journal-publish";
import { validateManualJournalLines } from "@/lib/accounting/manual-journal-validation";
import { parseJeReference } from "@/lib/accounting/parse-je-reference";

/**
 * ACCT-A.3 — Tests for the pure helpers the publish action uses to
 * build the auto-reverse JE and to encode the structured reference
 * keys, plus validator round-trips for the publish-time path.
 */

describe("manualJournalReference / manualJournalReverseReference", () => {
  it("encodes the primary MJ key in the expected MJ:<id> shape", () => {
    expect(manualJournalReference("cm-abc")).toBe("MJ:cm-abc");
  });

  it("encodes the reverse MJ key in the expected MJ-REV:<id> shape", () => {
    expect(manualJournalReverseReference("cm-abc")).toBe("MJ-REV:cm-abc");
  });

  it("round-trips through parseJeReference (primary)", () => {
    const ref = manualJournalReference("cm-xyz");
    const parsed = parseJeReference(ref);
    expect(parsed?.kind).toBe("MANUAL_JOURNAL");
    expect(parsed?.sourceId).toBe("cm-xyz");
    expect(parsed?.sourceHref).toBe("/accountant/manual-journals/cm-xyz");
  });

  it("round-trips through parseJeReference (reverse)", () => {
    const ref = manualJournalReverseReference("cm-xyz");
    const parsed = parseJeReference(ref);
    // The more-specific MJ-REV prefix must beat the broader MJ
    // prefix — guard against PARSERS-order regressions.
    expect(parsed?.kind).toBe("MANUAL_JOURNAL_REVERSE");
    expect(parsed?.sourceId).toBe("cm-xyz");
  });
});

describe("flipDrCrLines", () => {
  it("swaps debit and credit on every line", () => {
    const flipped = flipDrCrLines([
      { debit: 100, credit: 0 },
      { debit: 0, credit: 100 },
    ]);
    expect(flipped).toEqual([
      { debit: 0, credit: 100 },
      { debit: 100, credit: 0 },
    ]);
  });

  it("preserves extra fields (accountId, description) verbatim", () => {
    const flipped = flipDrCrLines([
      {
        accountId: "acc-1",
        description: "Rent",
        position: 0,
        debit: 1000,
        credit: 0,
      },
      {
        accountId: "acc-2",
        description: "Cash",
        position: 1,
        debit: 0,
        credit: 1000,
      },
    ]);
    expect(flipped[0]).toEqual({
      accountId: "acc-1",
      description: "Rent",
      position: 0,
      debit: 0,
      credit: 1000,
    });
    expect(flipped[1]).toEqual({
      accountId: "acc-2",
      description: "Cash",
      position: 1,
      debit: 1000,
      credit: 0,
    });
  });

  it("does not mutate the input array or its objects", () => {
    const input = [
      { debit: 10, credit: 0 },
      { debit: 0, credit: 10 },
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    flipDrCrLines(input);
    expect(input).toEqual(snapshot);
  });

  it("a flipped, balanced entry stays balanced (Σ DR = Σ CR)", () => {
    const orig = [
      { debit: 50, credit: 0 },
      { debit: 50, credit: 0 },
      { debit: 0, credit: 100 },
    ];
    const flipped = flipDrCrLines(orig);
    const dr = flipped.reduce((s, l) => s + l.debit, 0);
    const cr = flipped.reduce((s, l) => s + l.credit, 0);
    expect(dr).toBe(cr);
    expect(dr).toBe(100);
    // And the flipped entry passes the same balance validator the
    // publish action uses — so reverse JEs can never post unbalanced.
    expect(validateManualJournalLines(flipped)).toBeNull();
  });
});

describe("publish-time validation (mirrors actions.publishManualJournalAction)", () => {
  it("rejects publishing a DRAFT with fewer than 2 lines", () => {
    // publishManualJournalAction has an explicit "< 2 lines" guard
    // before reaching the validator. This pins the behavior at the
    // validator boundary too so we can never silently regress.
    expect(validateManualJournalLines([{ debit: 100, credit: 0 }])).toMatch(
      /at least two/i
    );
  });

  it("rejects publishing a DRAFT whose stored lines drift out of balance", () => {
    // Edge case the publish action guards against: lines were saved
    // valid, then a CoA constraint flipped, etc. Re-validating at
    // publish time means we catch it here, not at JE write.
    expect(
      validateManualJournalLines([
        { debit: 100, credit: 0 },
        { debit: 0, credit: 95 },
      ])
    ).toMatch(/must equal/i);
  });

  it("accepts publishing a multi-line balanced DRAFT", () => {
    expect(
      validateManualJournalLines([
        { debit: 250.5, credit: 0 },
        { debit: 749.5, credit: 0 },
        { debit: 0, credit: 1000 },
      ])
    ).toBeNull();
  });
});
