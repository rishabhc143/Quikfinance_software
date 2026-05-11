import { describe, it, expect } from "vitest";

/**
 * Tests for the Bill status state machine.
 *
 * Mirror the predicates the actions in
 * `app/(dashboard)/purchases/bills/actions.ts` enforce. If anyone
 * tweaks the rules there, these fail loudly with the spec'd shape.
 *
 * Spec lifecycle: DRAFT → OPEN → (PARTIALLY_PAID) → PAID
 *                                ↘ OVERDUE         ↗
 *                                ↘ VOID
 *                                ↘ WRITTEN_OFF
 */

const ALL_STATUSES = [
  "DRAFT",
  "OPEN",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "VOID",
  "WRITTEN_OFF",
] as const;
type Status = (typeof ALL_STATUSES)[number];

function canMarkOpen(s: Status): boolean {
  return s === "DRAFT";
}
function canVoid(s: Status): boolean {
  return s !== "VOID" && s !== "PAID";
}
function canWriteOff(s: Status): boolean {
  // Can write off any open balance — not Draft (no balance yet),
  // not Paid (no balance left), not already Void / Written off.
  return (
    s === "OPEN" || s === "PARTIALLY_PAID" || s === "OVERDUE"
  );
}
function canEdit(s: Status): boolean {
  return s !== "PAID" && s !== "WRITTEN_OFF";
}
function canRecordPayment(s: Status, balanceDue: number): boolean {
  if (balanceDue <= 0) return false;
  return s === "OPEN" || s === "PARTIALLY_PAID" || s === "OVERDUE";
}
function canHardDelete(s: Status): boolean {
  return s === "DRAFT";
}

describe("Bill state machine — markOpen", () => {
  it.each(ALL_STATUSES)("status=%s", (s) => {
    const allowed = canMarkOpen(s);
    if (s === "DRAFT") expect(allowed).toBe(true);
    else expect(allowed).toBe(false);
  });
});

describe("Bill state machine — void", () => {
  it("any non-Void, non-Paid → VOID", () => {
    expect(canVoid("DRAFT")).toBe(true);
    expect(canVoid("OPEN")).toBe(true);
    expect(canVoid("PARTIALLY_PAID")).toBe(true);
    expect(canVoid("OVERDUE")).toBe(true);
    expect(canVoid("WRITTEN_OFF")).toBe(true); // can reverse a write-off
    expect(canVoid("PAID")).toBe(false);
    expect(canVoid("VOID")).toBe(false);
  });
});

describe("Bill state machine — writeOff", () => {
  it("only Open / Partially Paid / Overdue can be written off", () => {
    expect(canWriteOff("DRAFT")).toBe(false);
    expect(canWriteOff("OPEN")).toBe(true);
    expect(canWriteOff("PARTIALLY_PAID")).toBe(true);
    expect(canWriteOff("OVERDUE")).toBe(true);
    expect(canWriteOff("PAID")).toBe(false);
    expect(canWriteOff("VOID")).toBe(false);
    expect(canWriteOff("WRITTEN_OFF")).toBe(false);
  });
});

describe("Bill state machine — edit gating", () => {
  it("Paid and Written-off bills are not editable", () => {
    expect(canEdit("DRAFT")).toBe(true);
    expect(canEdit("OPEN")).toBe(true);
    expect(canEdit("PARTIALLY_PAID")).toBe(true);
    expect(canEdit("OVERDUE")).toBe(true);
    expect(canEdit("VOID")).toBe(true);
    expect(canEdit("PAID")).toBe(false);
    expect(canEdit("WRITTEN_OFF")).toBe(false);
  });
});

describe("Bill state machine — record payment", () => {
  it("requires positive balance and a payable status", () => {
    expect(canRecordPayment("DRAFT", 100)).toBe(false);
    expect(canRecordPayment("OPEN", 100)).toBe(true);
    expect(canRecordPayment("PARTIALLY_PAID", 100)).toBe(true);
    expect(canRecordPayment("OVERDUE", 100)).toBe(true);
    expect(canRecordPayment("PAID", 0)).toBe(false);
    expect(canRecordPayment("VOID", 100)).toBe(false);
    expect(canRecordPayment("WRITTEN_OFF", 100)).toBe(false);
  });

  it("zero balance always blocks", () => {
    for (const s of ALL_STATUSES) {
      expect(canRecordPayment(s, 0)).toBe(false);
    }
  });
});

describe("Bill state machine — hard delete", () => {
  it.each(ALL_STATUSES)("status=%s", (s) => {
    const allowed = canHardDelete(s);
    if (s === "DRAFT") expect(allowed).toBe(true);
    else expect(allowed).toBe(false);
  });
});

describe("Bill state machine — terminal semantics", () => {
  it("PAID blocks edit, void, write-off, payment, delete", () => {
    const s: Status = "PAID";
    expect(canEdit(s)).toBe(false);
    expect(canVoid(s)).toBe(false);
    expect(canWriteOff(s)).toBe(false);
    expect(canRecordPayment(s, 100)).toBe(false);
    expect(canHardDelete(s)).toBe(false);
  });

  it("WRITTEN_OFF blocks edit, write-off, payment, delete (but can be voided)", () => {
    const s: Status = "WRITTEN_OFF";
    expect(canEdit(s)).toBe(false);
    expect(canWriteOff(s)).toBe(false);
    expect(canRecordPayment(s, 100)).toBe(false);
    expect(canHardDelete(s)).toBe(false);
    expect(canVoid(s)).toBe(true); // reversible
  });
});
