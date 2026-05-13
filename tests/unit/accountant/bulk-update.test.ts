import { describe, it, expect } from "vitest";
import {
  BULK_UPDATE_FIELDS,
  findField,
  coerceBulkUpdateValue,
  modelForCategory,
} from "@/lib/accountant/bulk-update";

/**
 * Tests for ACCT-B's pure helpers. The whitelist is the single source
 * of truth for what fields the action accepts.
 */

describe("BULK_UPDATE_FIELDS — whitelist shape", () => {
  it("exposes the three v1 categories with non-empty field lists", () => {
    expect(BULK_UPDATE_FIELDS.ITEMS.length).toBeGreaterThan(0);
    expect(BULK_UPDATE_FIELDS.CUSTOMERS.length).toBeGreaterThan(0);
    expect(BULK_UPDATE_FIELDS.VENDORS.length).toBeGreaterThan(0);
  });

  it("does NOT expose any Invoice/Bill category (ledger-side fields are deferred)", () => {
    expect(BULK_UPDATE_FIELDS).not.toHaveProperty("INVOICES");
    expect(BULK_UPDATE_FIELDS).not.toHaveProperty("BILLS");
  });
});

describe("findField", () => {
  it("returns the config when (category, field) is whitelisted", () => {
    expect(findField("ITEMS", "sellingPrice")?.key).toBe("sellingPrice");
    expect(findField("CUSTOMERS", "paymentTermsId")?.key).toBe("paymentTermsId");
  });

  it("returns null for unknown field key", () => {
    expect(findField("ITEMS", "name")).toBeNull(); // name isn't bulk-updatable
    expect(findField("ITEMS", "doesNotExist")).toBeNull();
  });

  it("returns null when fields don't belong to the category", () => {
    expect(findField("ITEMS", "paymentTermsId")).toBeNull();
    expect(findField("CUSTOMERS", "sellingPrice")).toBeNull();
  });
});

describe("coerceBulkUpdateValue — numbers", () => {
  it("accepts a numeric value within bounds", () => {
    expect(coerceBulkUpdateValue("ITEMS", "sellingPrice", 500)).toEqual({
      value: 500,
    });
    expect(coerceBulkUpdateValue("ITEMS", "sellingPrice", "500.50")).toEqual({
      value: 500.5,
    });
  });

  it("rejects negative numbers (min = 0)", () => {
    const r = coerceBulkUpdateValue("ITEMS", "sellingPrice", -1);
    expect("error" in r).toBe(true);
  });

  it("rejects non-numeric strings", () => {
    const r = coerceBulkUpdateValue("ITEMS", "costPrice", "not a number");
    expect("error" in r).toBe(true);
  });

  it("rejects empty input", () => {
    expect(
      "error" in coerceBulkUpdateValue("ITEMS", "sellingPrice", "")
    ).toBe(true);
    expect(
      "error" in coerceBulkUpdateValue("ITEMS", "sellingPrice", null)
    ).toBe(true);
  });
});

describe("coerceBulkUpdateValue — text + currency", () => {
  it("trims text and treats empty as null", () => {
    expect(coerceBulkUpdateValue("CUSTOMERS", "currency", "  ")).toEqual({
      value: null,
    });
  });

  it("uppercases + validates currency as ISO 3-letter", () => {
    expect(coerceBulkUpdateValue("CUSTOMERS", "currency", "inr")).toEqual({
      value: "INR",
    });
    expect(coerceBulkUpdateValue("CUSTOMERS", "currency", "USD")).toEqual({
      value: "USD",
    });
    const bad = coerceBulkUpdateValue("CUSTOMERS", "currency", "Rupees");
    expect("error" in bad).toBe(true);
  });
});

describe("coerceBulkUpdateValue — select + boolean", () => {
  it("select: passes through non-empty string id; empty/null → null", () => {
    expect(coerceBulkUpdateValue("ITEMS", "taxId", "cm0tax1")).toEqual({
      value: "cm0tax1",
    });
    expect(coerceBulkUpdateValue("ITEMS", "taxId", "")).toEqual({ value: null });
    expect(coerceBulkUpdateValue("ITEMS", "taxId", null)).toEqual({
      value: null,
    });
  });

  it("boolean: accepts true/false directly or as strings", () => {
    expect(coerceBulkUpdateValue("ITEMS", "isActive", true)).toEqual({
      value: true,
    });
    expect(coerceBulkUpdateValue("ITEMS", "isActive", "false")).toEqual({
      value: false,
    });
  });

  it("boolean: rejects non-boolean input", () => {
    expect(
      "error" in coerceBulkUpdateValue("ITEMS", "isActive", "maybe")
    ).toBe(true);
  });
});

describe("coerceBulkUpdateValue — guardrails", () => {
  it("rejects non-whitelisted (category, field) pairs", () => {
    const r = coerceBulkUpdateValue(
      "ITEMS",
      // @ts-expect-error — intentionally invalid
      "paymentTermsId",
      "cm0pt1"
    );
    expect("error" in r).toBe(true);
    if ("error" in r) {
      expect(r.error).toMatch(/isn't bulk-updatable/i);
    }
  });
});

describe("modelForCategory", () => {
  it("ITEMS routes to the item table with deletedAt filter", () => {
    const m = modelForCategory("ITEMS");
    expect(m.table).toBe("item");
    expect(m.activeField).toBe("isActive");
  });

  it("CUSTOMERS routes to the contact table with type filter", () => {
    const m = modelForCategory("CUSTOMERS");
    expect(m.table).toBe("contact");
    expect(m.activeField).toBe("isInactive");
    expect((m.scopeWhere as { type: { in: string[] } }).type.in).toContain(
      "CUSTOMER"
    );
  });

  it("VENDORS routes to the contact table with VENDOR type filter", () => {
    const m = modelForCategory("VENDORS");
    expect(m.table).toBe("contact");
    expect((m.scopeWhere as { type: { in: string[] } }).type.in).toContain(
      "VENDOR"
    );
    expect((m.scopeWhere as { type: { in: string[] } }).type.in).not.toContain(
      "CUSTOMER"
    );
  });
});
