import { describe, it, expect } from "vitest";
import {
  findDuplicate,
  markDuplicates,
} from "@/lib/banking/duplicate-detection";

/**
 * Tests for BNK-A duplicate detection.
 *
 * The quadruple match: (accountId, date, amount, reference).
 * Same-day + same-amount + same-reference → duplicate.
 * Empty reference → cannot dedup confidently → returns null.
 */

const TXN = (
  date: string,
  amount: number,
  reference: string | null,
  id = "existing-1"
) => ({ id, date: new Date(date), amount, reference });

describe("findDuplicate — quadruple match", () => {
  it("matches same date + amount + reference", () => {
    const existing = [TXN("2026-04-01", 5000, "RENT-0401")];
    const dup = findDuplicate(
      { date: new Date("2026-04-01"), amount: 5000, reference: "RENT-0401" },
      existing
    );
    expect(dup).toBe("existing-1");
  });

  it("returns null when reference differs", () => {
    const existing = [TXN("2026-04-01", 5000, "RENT-0401")];
    const dup = findDuplicate(
      { date: new Date("2026-04-01"), amount: 5000, reference: "RENT-0402" },
      existing
    );
    expect(dup).toBeNull();
  });

  it("returns null when date differs", () => {
    const existing = [TXN("2026-04-01", 5000, "RENT-0401")];
    const dup = findDuplicate(
      { date: new Date("2026-04-02"), amount: 5000, reference: "RENT-0401" },
      existing
    );
    expect(dup).toBeNull();
  });

  it("returns null when amount differs (even slightly)", () => {
    const existing = [TXN("2026-04-01", 5000, "RENT-0401")];
    const dup = findDuplicate(
      { date: new Date("2026-04-01"), amount: 5000.5, reference: "RENT-0401" },
      existing
    );
    expect(dup).toBeNull();
  });

  it("ignores time-of-day differences (same calendar day)", () => {
    const existing = [TXN("2026-04-01T09:30:00Z", 5000, "RENT-0401")];
    const dup = findDuplicate(
      {
        date: new Date("2026-04-01T18:45:00Z"),
        amount: 5000,
        reference: "RENT-0401",
      },
      existing
    );
    expect(dup).toBe("existing-1");
  });

  it("is case-insensitive on reference", () => {
    const existing = [TXN("2026-04-01", 5000, "rent-0401")];
    const dup = findDuplicate(
      { date: new Date("2026-04-01"), amount: 5000, reference: "RENT-0401" },
      existing
    );
    expect(dup).toBe("existing-1");
  });

  it("trims whitespace on reference", () => {
    const existing = [TXN("2026-04-01", 5000, "  RENT-0401  ")];
    const dup = findDuplicate(
      { date: new Date("2026-04-01"), amount: 5000, reference: "RENT-0401" },
      existing
    );
    expect(dup).toBe("existing-1");
  });

  it("returns null when candidate reference is empty (cannot dedup confidently)", () => {
    const existing = [TXN("2026-04-01", 5000, "RENT-0401")];
    const dup = findDuplicate(
      { date: new Date("2026-04-01"), amount: 5000, reference: null },
      existing
    );
    expect(dup).toBeNull();
  });

  it("tolerates 4-decimal-place amount precision", () => {
    const existing = [TXN("2026-04-01", 5000.1234, "RENT")];
    const dup = findDuplicate(
      { date: new Date("2026-04-01"), amount: 5000.1234, reference: "RENT" },
      existing
    );
    expect(dup).toBe("existing-1");
  });
});

describe("markDuplicates", () => {
  it("annotates each candidate with duplicate status", () => {
    const existing = [TXN("2026-04-01", 5000, "RENT-0401")];
    const candidates = [
      { date: new Date("2026-04-01"), amount: 5000, reference: "RENT-0401" },
      { date: new Date("2026-04-01"), amount: 200, reference: "COFFEE" },
    ];
    const annotated = markDuplicates(candidates, existing);
    expect(annotated[0].duplicateOfId).toBe("existing-1");
    expect(annotated[0].duplicateReason).toMatch(/duplicate of/);
    expect(annotated[1].duplicateOfId).toBeNull();
    expect(annotated[1].duplicateReason).toBeNull();
  });

  it("preserves the input shape on candidates that aren't duplicates", () => {
    const existing: ReturnType<typeof TXN>[] = [];
    const candidates = [
      { date: new Date("2026-04-01"), amount: 100, reference: "X" },
    ];
    const annotated = markDuplicates(candidates, existing);
    expect(annotated).toHaveLength(1);
    expect(annotated[0].duplicateOfId).toBeNull();
  });
});
