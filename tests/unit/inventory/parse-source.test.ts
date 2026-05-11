import { describe, it, expect } from "vitest";
import { parseSourceFromReason } from "@/lib/inventory/parse-source";

/**
 * Tests for the reason-string parser used by the adjustment-history
 * dialog to surface a deep-link to the source document.
 *
 * The reason strings are produced by:
 *   - applyInvoiceStockDecrement       → "Invoice <number>"
 *   - reverseInvoiceStockDecrement     → "Reverse Invoice <number>"
 *   - applyCreditNoteStockReturn       → "Credit Note <number>"
 *   - reverseCreditNoteStockReturn     → "Reverse Credit Note <number>"
 * Anything else (e.g. user-created manual adjustments) returns null.
 */

describe("parseSourceFromReason", () => {
  it("matches an invoice reason", () => {
    expect(parseSourceFromReason("Invoice INV-001")).toEqual({
      type: "invoice",
      number: "INV-001",
    });
  });

  it("matches a credit-note reason", () => {
    expect(parseSourceFromReason("Credit Note CN-042")).toEqual({
      type: "credit-note",
      number: "CN-042",
    });
  });

  it("matches a delivery-challan reason", () => {
    expect(parseSourceFromReason("DeliveryChallan DC-007")).toEqual({
      type: "delivery-challan",
      number: "DC-007",
    });
  });

  it("strips the `Reverse ` prefix (so both directions deep-link the same way)", () => {
    expect(parseSourceFromReason("Reverse Invoice INV-001")).toEqual({
      type: "invoice",
      number: "INV-001",
    });
    expect(parseSourceFromReason("Reverse Credit Note CN-042")).toEqual({
      type: "credit-note",
      number: "CN-042",
    });
    expect(parseSourceFromReason("Reverse DeliveryChallan DC-007")).toEqual({
      type: "delivery-challan",
      number: "DC-007",
    });
  });

  it("handles numbers with dashes / slashes (e.g. INV-2026/04/01)", () => {
    expect(parseSourceFromReason("Invoice INV-2026/04/01")).toEqual({
      type: "invoice",
      number: "INV-2026/04/01",
    });
  });

  it("returns null for unknown reasons", () => {
    expect(parseSourceFromReason("Damage in warehouse")).toBeNull();
    expect(parseSourceFromReason("Stock count adjustment")).toBeNull();
  });

  it("returns null for empty / malformed input", () => {
    expect(parseSourceFromReason("")).toBeNull();
    expect(parseSourceFromReason("Invoice")).toBeNull();
    expect(parseSourceFromReason("Invoice ")).toBeNull();
  });

  it("is case-sensitive (intentional — reason strings are produced by code, not users)", () => {
    expect(parseSourceFromReason("invoice INV-001")).toBeNull();
    expect(parseSourceFromReason("INVOICE INV-001")).toBeNull();
  });
});
