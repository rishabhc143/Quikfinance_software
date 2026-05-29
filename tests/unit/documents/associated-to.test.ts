import { describe, it, expect } from "vitest";
import {
  asAssociatedEntityType,
  typeLabelFor,
  hrefForAssociated,
  buildAssociatedToCell,
  KNOWN_ASSOCIATED_ENTITY_TYPES,
  type AssociatedEntityType,
} from "@/lib/documents/associated-to";

describe("documents/associated-to", () => {
  describe("asAssociatedEntityType", () => {
    it("accepts every known type", () => {
      for (const t of KNOWN_ASSOCIATED_ENTITY_TYPES) {
        expect(asAssociatedEntityType(t)).toBe(t);
      }
    });

    it("rejects unknown / null / empty strings", () => {
      expect(asAssociatedEntityType("Unknown")).toBeNull();
      expect(asAssociatedEntityType("")).toBeNull();
      expect(asAssociatedEntityType(null)).toBeNull();
      expect(asAssociatedEntityType(undefined)).toBeNull();
    });

    it("is case-sensitive (forces canonical casing)", () => {
      expect(asAssociatedEntityType("invoice")).toBeNull();
      expect(asAssociatedEntityType("INVOICE")).toBeNull();
    });
  });

  describe("typeLabelFor", () => {
    it("returns a non-empty label for every known type", () => {
      for (const t of KNOWN_ASSOCIATED_ENTITY_TYPES) {
        expect(typeLabelFor(t)).toBeTruthy();
        expect(typeLabelFor(t).length).toBeGreaterThan(0);
      }
    });

    it("formats multi-word types with spaces", () => {
      expect(typeLabelFor("SalesOrder")).toBe("Sales Order");
      expect(typeLabelFor("PurchaseOrder")).toBe("Purchase Order");
      expect(typeLabelFor("CreditNote")).toBe("Credit Note");
      expect(typeLabelFor("DeliveryChallan")).toBe("Delivery Challan");
      expect(typeLabelFor("VendorCredit")).toBe("Vendor Credit");
      expect(typeLabelFor("PaymentReceived")).toBe("Payment Received");
      expect(typeLabelFor("PaymentMade")).toBe("Payment Made");
      expect(typeLabelFor("ManualJournal")).toBe("Manual Journal");
      expect(typeLabelFor("BankTransaction")).toBe("Bank Transaction");
    });

    it("single-word types stay as-is", () => {
      expect(typeLabelFor("Invoice")).toBe("Invoice");
      expect(typeLabelFor("Bill")).toBe("Bill");
      expect(typeLabelFor("Contact")).toBe("Contact");
    });
  });

  describe("hrefForAssociated", () => {
    it("builds the right URL pattern for sales documents", () => {
      expect(hrefForAssociated("Invoice", "inv-1")).toBe("/sales/invoices/inv-1");
      expect(hrefForAssociated("Quote", "q-1")).toBe("/sales/quotes/q-1");
      expect(hrefForAssociated("SalesOrder", "so-1")).toBe(
        "/sales/sales-orders/so-1"
      );
      expect(hrefForAssociated("CreditNote", "cn-1")).toBe(
        "/sales/credit-notes/cn-1"
      );
      expect(hrefForAssociated("DeliveryChallan", "dc-1")).toBe(
        "/sales/delivery-challans/dc-1"
      );
      expect(hrefForAssociated("PaymentReceived", "pr-1")).toBe(
        "/sales/payments-received/pr-1"
      );
    });

    it("builds the right URL pattern for purchases documents", () => {
      expect(hrefForAssociated("Bill", "b-1")).toBe("/purchases/bills/b-1");
      expect(hrefForAssociated("PurchaseOrder", "po-1")).toBe(
        "/purchases/orders/po-1"
      );
      expect(hrefForAssociated("VendorCredit", "vc-1")).toBe(
        "/purchases/vendor-credits/vc-1"
      );
      expect(hrefForAssociated("Expense", "e-1")).toBe(
        "/purchases/expenses/e-1"
      );
      expect(hrefForAssociated("PaymentMade", "pm-1")).toBe(
        "/purchases/payments-made/pm-1"
      );
    });

    it("Contact links to the customers route by convention", () => {
      // Contacts can be customer or vendor — the customers route handles
      // both because routing is by contact id, not type.
      expect(hrefForAssociated("Contact", "c-1")).toBe("/sales/customers/c-1");
    });

    it("Project + ManualJournal + BankTransaction routes wired", () => {
      expect(hrefForAssociated("Project", "p-1")).toBe("/time/projects/p-1");
      expect(hrefForAssociated("ManualJournal", "mj-1")).toBe(
        "/accountant/manual-journals/mj-1"
      );
      // BankTransaction no longer has its own per-ID route after the
      // Banking sub-modules were trimmed; the helper falls back to /banking
      // and the user picks the account from there.
      expect(hrefForAssociated("BankTransaction", "bt-1")).toBe("/banking");
    });
  });

  describe("buildAssociatedToCell", () => {
    it("uses the provided name when non-empty", () => {
      const cell = buildAssociatedToCell("Invoice", "inv-1", "INV-001");
      expect(cell.name).toBe("INV-001");
      expect(cell.type).toBe("Invoice");
      expect(cell.id).toBe("inv-1");
      expect(cell.href).toBe("/sales/invoices/inv-1");
      expect(cell.typeLabel).toBe("Invoice");
    });

    it("falls back to id when name is null / empty / whitespace", () => {
      expect(buildAssociatedToCell("Bill", "b-2", null).name).toBe("b-2");
      expect(buildAssociatedToCell("Bill", "b-2", "").name).toBe("b-2");
      expect(buildAssociatedToCell("Bill", "b-2", "   ").name).toBe("b-2");
      expect(buildAssociatedToCell("Bill", "b-2", undefined).name).toBe("b-2");
    });

    it("emits a stable shape for every known type", () => {
      for (const type of KNOWN_ASSOCIATED_ENTITY_TYPES) {
        const cell = buildAssociatedToCell(type as AssociatedEntityType, "x", "Name");
        expect(cell.type).toBe(type);
        expect(cell.id).toBe("x");
        expect(cell.name).toBe("Name");
        expect(cell.href).toBeTruthy();
        expect(cell.typeLabel).toBeTruthy();
      }
    });
  });

  describe("KNOWN_ASSOCIATED_ENTITY_TYPES", () => {
    it("has no duplicates", () => {
      const set = new Set(KNOWN_ASSOCIATED_ENTITY_TYPES);
      expect(set.size).toBe(KNOWN_ASSOCIATED_ENTITY_TYPES.length);
    });

    it("includes the 15 v1 types", () => {
      expect(KNOWN_ASSOCIATED_ENTITY_TYPES).toHaveLength(15);
    });
  });
});
