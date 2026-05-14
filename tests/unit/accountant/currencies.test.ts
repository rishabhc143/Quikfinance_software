import { describe, it, expect } from "vitest";
import {
  ISO_CURRENCIES,
  currencyName,
  currencyLabel,
} from "@/lib/accounting/currencies";

/**
 * ACCT-C.3 — Sanity tests for the ISO 4217 currency list used by
 * the Base Currency Adjustment modal's Currency dropdown.
 */

describe("ISO_CURRENCIES", () => {
  it("includes the major economies", () => {
    const codes = new Set(ISO_CURRENCIES.map((c) => c.code));
    for (const must of [
      "USD",
      "EUR",
      "GBP",
      "INR",
      "AED",
      "JPY",
      "CNY",
      "CAD",
      "AUD",
      "SGD",
      "CHF",
      "ZAR",
    ]) {
      expect(codes.has(must)).toBe(true);
    }
  });

  it("every code is exactly 3 uppercase letters (ISO 4217)", () => {
    for (const c of ISO_CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("every entry has a non-empty name", () => {
    for (const c of ISO_CURRENCIES) {
      expect(c.name.length).toBeGreaterThan(0);
    }
  });

  it("codes are unique (no dupes)", () => {
    const codes = ISO_CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("list is sorted alphabetically by code", () => {
    const sorted = [...ISO_CURRENCIES].sort((a, b) =>
      a.code.localeCompare(b.code)
    );
    expect(ISO_CURRENCIES.map((c) => c.code)).toEqual(
      sorted.map((c) => c.code)
    );
  });
});

describe("currencyName", () => {
  it("returns the readable name for known codes", () => {
    expect(currencyName("AED")).toBe("UAE Dirham");
    expect(currencyName("INR")).toBe("Indian Rupee");
    expect(currencyName("USD")).toBe("US Dollar");
  });

  it("is case-insensitive on input", () => {
    expect(currencyName("aed")).toBe("UAE Dirham");
  });

  it("falls back to the code when unknown", () => {
    expect(currencyName("XYZ")).toBe("XYZ");
  });
});

describe("currencyLabel", () => {
  it("returns the Zoho-style 'CODE — Name' label", () => {
    expect(currencyLabel("AED")).toBe("AED — UAE Dirham");
    expect(currencyLabel("INR")).toBe("INR — Indian Rupee");
  });

  it("falls back to the bare code when unknown", () => {
    expect(currencyLabel("XYZ")).toBe("XYZ");
  });
});
