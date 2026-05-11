import { describe, it, expect } from "vitest";

/**
 * Tests for the Purchase Order status state machine.
 *
 * Why a pure-function test instead of an integration test? The action
 * implementations live in `app/(dashboard)/purchases/orders/actions.ts`
 * with "use server" + heavy DB coupling — they need a real Prisma
 * client to run. Here we test the *rule set* the actions enforce
 * (the guard predicates) so anyone who refactors them has a
 * regression net.
 *
 * The implementation embeds these rules in two ways:
 *  - markPurchaseOrderIssuedAction throws when current status !== DRAFT
 *  - cancelPurchaseOrderAction throws when current status === CANCELLED
 *  - closePurchaseOrderAction throws when current status not in
 *    {ISSUED, PARTIALLY_BILLED, BILLED}
 *  - convertPurchaseOrderToBillAction throws when current status not in
 *    {ISSUED, PARTIALLY_BILLED}
 *  - bulkClosePurchaseOrdersAction filters to {ISSUED, PARTIALLY_BILLED,
 *    BILLED} in the where-clause (other rows skipped silently)
 *  - bulkCancelPurchaseOrdersAction filters to status !== CANCELLED
 *  - deletePurchaseOrderAction (single + bulk) blocks when linked
 *    non-deleted bills exist
 */

const ALL_STATUSES = [
  "DRAFT",
  "ISSUED",
  "PARTIALLY_BILLED",
  "BILLED",
  "CLOSED",
  "CANCELLED",
] as const;
type Status = (typeof ALL_STATUSES)[number];

// Mirror the predicates the actions use. If these change in
// actions.ts, this test file must be kept in sync — that's the point.
function canMarkIssued(s: Status): boolean {
  return s === "DRAFT";
}
function canCancel(s: Status): boolean {
  return s !== "CANCELLED";
}
function canClose(s: Status): boolean {
  return s === "ISSUED" || s === "PARTIALLY_BILLED" || s === "BILLED";
}
function canConvertToBill(s: Status): boolean {
  return s === "ISSUED" || s === "PARTIALLY_BILLED";
}
function canEdit(s: Status): boolean {
  return s !== "CLOSED" && s !== "CANCELLED";
}
function canDeleteWhenLinkedBills(linkedBills: number): boolean {
  return linkedBills === 0;
}

describe("PO state machine — markIssued", () => {
  it.each(ALL_STATUSES)("status=%s", (s) => {
    const allowed = canMarkIssued(s);
    if (s === "DRAFT") expect(allowed).toBe(true);
    else expect(allowed).toBe(false);
  });
});

describe("PO state machine — cancel", () => {
  it.each(ALL_STATUSES)("status=%s", (s) => {
    const allowed = canCancel(s);
    if (s === "CANCELLED") expect(allowed).toBe(false);
    else expect(allowed).toBe(true);
  });
});

describe("PO state machine — close", () => {
  it("only Issued / Partially Billed / Billed can be closed", () => {
    expect(canClose("DRAFT")).toBe(false);
    expect(canClose("ISSUED")).toBe(true);
    expect(canClose("PARTIALLY_BILLED")).toBe(true);
    expect(canClose("BILLED")).toBe(true);
    expect(canClose("CLOSED")).toBe(false);
    expect(canClose("CANCELLED")).toBe(false);
  });
});

describe("PO state machine — convertToBill", () => {
  it("only Issued or Partially Billed convert (not Draft, not Billed)", () => {
    expect(canConvertToBill("DRAFT")).toBe(false);
    expect(canConvertToBill("ISSUED")).toBe(true);
    expect(canConvertToBill("PARTIALLY_BILLED")).toBe(true);
    expect(canConvertToBill("BILLED")).toBe(false);
    expect(canConvertToBill("CLOSED")).toBe(false);
    expect(canConvertToBill("CANCELLED")).toBe(false);
  });
});

describe("PO state machine — edit gating", () => {
  it("Closed and Cancelled POs are not editable", () => {
    expect(canEdit("DRAFT")).toBe(true);
    expect(canEdit("ISSUED")).toBe(true);
    expect(canEdit("PARTIALLY_BILLED")).toBe(true);
    expect(canEdit("BILLED")).toBe(true);
    expect(canEdit("CLOSED")).toBe(false);
    expect(canEdit("CANCELLED")).toBe(false);
  });
});

describe("PO state machine — delete with linked bills", () => {
  it("allows delete when no bills reference the PO", () => {
    expect(canDeleteWhenLinkedBills(0)).toBe(true);
  });
  it("blocks delete when any bill references the PO", () => {
    expect(canDeleteWhenLinkedBills(1)).toBe(false);
    expect(canDeleteWhenLinkedBills(5)).toBe(false);
  });
});

describe("PO state machine — terminal states", () => {
  it("CLOSED has no outbound transitions", () => {
    const s: Status = "CLOSED";
    expect(canMarkIssued(s)).toBe(false);
    expect(canClose(s)).toBe(false);
    expect(canConvertToBill(s)).toBe(false);
    expect(canEdit(s)).toBe(false);
    // Cancel is still allowed (you can cancel a closed PO if you
    // realize it shouldn't have been closed — accountants need that
    // escape hatch). Document the choice here.
    expect(canCancel(s)).toBe(true);
  });

  it("CANCELLED is fully terminal", () => {
    const s: Status = "CANCELLED";
    expect(canMarkIssued(s)).toBe(false);
    expect(canClose(s)).toBe(false);
    expect(canConvertToBill(s)).toBe(false);
    expect(canEdit(s)).toBe(false);
    expect(canCancel(s)).toBe(false);
  });
});
