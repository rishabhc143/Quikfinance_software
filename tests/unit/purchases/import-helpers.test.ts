import { describe, it, expect } from "vitest";
import {
  makeHeaderNormalizer,
  parseImportDate,
  parseImportBool,
} from "@/lib/purchases/import-helpers";

/**
 * Tests for the CSV-import parsing helpers shared by the four
 * Purchases import wizards (bills / vendor-credits / recurring-bills
 * / recurring-expenses).
 *
 * These are the pure-function bits — date / bool parsing, header alias
 * resolution. The wizard actions themselves touch Prisma so they're
 * covered by integration / Playwright instead.
 */

describe("makeHeaderNormalizer", () => {
  const aliases: Record<string, string> = {
    "vendor": "vendorName",
    "vendor name": "vendorName",
    "supplier": "vendorName",
    "bill number": "number",
    "bill #": "number",
    "currency": "currency",
  };
  const norm = makeHeaderNormalizer(aliases);

  it("maps common spellings to a canonical field name", () => {
    expect(norm("Vendor")).toBe("vendorName");
    expect(norm("vendor name")).toBe("vendorName");
    expect(norm("SUPPLIER")).toBe("vendorName");
  });

  it("is case-insensitive on alias lookup", () => {
    expect(norm("Bill Number")).toBe("number");
    expect(norm("BILL NUMBER")).toBe("number");
  });

  it("trims surrounding whitespace before lookup", () => {
    expect(norm("  vendor  ")).toBe("vendorName");
    expect(norm("\tbill #\t")).toBe("number");
  });

  it("passes unknown headers through unchanged (trimmed)", () => {
    expect(norm("custom_column")).toBe("custom_column");
    expect(norm("  some_random  ")).toBe("some_random");
  });

  it("truncates excessively long unknown headers to 80 chars", () => {
    const long = "x".repeat(200);
    const out = norm(long);
    expect(out.length).toBe(80);
  });
});

describe("parseImportDate", () => {
  it("parses ISO yyyy-mm-dd", () => {
    const d = parseImportDate("2026-05-12");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    // Month is 0-indexed in JS Date
    expect(d!.getMonth()).toBe(4);
  });

  it("parses dd/mm/yyyy as India-default", () => {
    // 12/05/2026 must be interpreted as 12 May 2026, not Dec 5
    const d = parseImportDate("12/05/2026");
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(12);
    expect(d!.getMonth()).toBe(4); // May
    expect(d!.getFullYear()).toBe(2026);
  });

  it("parses dd-mm-yyyy with dash separator", () => {
    const d = parseImportDate("01-04-2026");
    expect(d).not.toBeNull();
    expect(d!.getDate()).toBe(1);
    expect(d!.getMonth()).toBe(3); // April
  });

  it("returns null for empty / undefined", () => {
    expect(parseImportDate("")).toBeNull();
    expect(parseImportDate("   ")).toBeNull();
    expect(parseImportDate(undefined)).toBeNull();
  });

  it("falls back to native Date for unusual strings", () => {
    const d = parseImportDate("May 1, 2026");
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
  });

  it("returns null for garbage", () => {
    expect(parseImportDate("not-a-date")).toBeNull();
    expect(parseImportDate("xyz")).toBeNull();
  });
});

describe("parseImportBool", () => {
  it.each([
    ["true", true],
    ["yes", true],
    ["1", true],
    ["y", true],
    ["TRUE", true],
    ["Yes", true],
  ])("parses %s as true", (input, expected) => {
    expect(parseImportBool(input)).toBe(expected);
  });

  it.each([
    ["false", false],
    ["no", false],
    ["0", false],
    ["n", false],
    ["FALSE", false],
    ["No", false],
  ])("parses %s as false", (input, expected) => {
    expect(parseImportBool(input)).toBe(expected);
  });

  it("returns null for empty / undefined / unknown", () => {
    expect(parseImportBool(undefined)).toBeNull();
    expect(parseImportBool("")).toBeNull();
    expect(parseImportBool("  ")).toBeNull();
    expect(parseImportBool("maybe")).toBeNull();
    expect(parseImportBool("2")).toBeNull();
  });

  it("trims surrounding whitespace before matching", () => {
    expect(parseImportBool("  yes  ")).toBe(true);
    expect(parseImportBool("\tno\t")).toBe(false);
  });
});
