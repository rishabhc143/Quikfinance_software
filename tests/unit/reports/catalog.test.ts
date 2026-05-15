import { describe, it, expect } from "vitest";
import {
  REPORTS,
  REPORT_CATEGORIES,
  REPORT_COUNT,
  reportsByCategory,
  findReport,
} from "@/lib/reports/catalog";

/**
 * REPORTS-CENTER — Invariants for the static report catalog driving
 * `/reports`. Anything that violates these would either break the
 * favorites toggle (duplicate / unknown keys), the category
 * sidebar (orphan category), or the Zoho-parity row count.
 */

describe("REPORTS catalog", () => {
  it("has exactly 80 reports (matches Zoho's All Reports badge)", () => {
    expect(REPORTS).toHaveLength(80);
    expect(REPORT_COUNT).toBe(80);
  });

  it("every report has a non-empty key + name + category", () => {
    for (const r of REPORTS) {
      expect(r.key.length).toBeGreaterThan(0);
      expect(r.name.length).toBeGreaterThan(0);
      expect(r.category.length).toBeGreaterThan(0);
    }
  });

  it("keys are unique across the whole catalog", () => {
    const keys = REPORTS.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every category on a report is in the canonical category list", () => {
    const allowed = new Set<string>(REPORT_CATEGORIES);
    for (const r of REPORTS) {
      expect(allowed.has(r.category)).toBe(true);
    }
  });

  it("every available report has an href, every unavailable does not", () => {
    for (const r of REPORTS) {
      if (r.available) {
        expect(r.href, `${r.key} is available but has no href`).toBeTruthy();
      } else {
        expect(r.href, `${r.key} is unavailable but has an href`).toBeUndefined();
      }
    }
  });

  it("at least 10 reports are available (matches what we've built)", () => {
    const available = REPORTS.filter((r) => r.available);
    expect(available.length).toBeGreaterThanOrEqual(10);
  });

  it("known anchor reports are present + available", () => {
    // These are the routes our existing code links to. If any goes
    // missing, every existing link out of the Reports Center
    // silently 404s.
    const mustExistAndBeAvailable = [
      "profit-and-loss",
      "cash-flow-statement",
      "balance-sheet",
      "sales-summary",
      "ar-aging-summary",
      "ap-aging-summary",
      "tax-summary",
      "gstr-1",
      "trial-balance",
      "stock-valuation",
    ];
    for (const key of mustExistAndBeAvailable) {
      const r = findReport(key);
      expect(r, `${key} missing from catalog`).toBeDefined();
      expect(r!.available, `${key} should be marked available`).toBe(true);
    }
  });
});

describe("reportsByCategory", () => {
  it("returns one entry per category, none empty for shipped categories", () => {
    const by = reportsByCategory();
    for (const c of REPORT_CATEGORIES) {
      expect(by[c]).toBeDefined();
    }
    // Business Overview should have at least one entry (sanity).
    expect(by["Business Overview"].length).toBeGreaterThan(0);
  });

  it("preserves entry order within a category", () => {
    const by = reportsByCategory();
    const overview = by["Business Overview"];
    // The first Business Overview entry is Profit and Loss
    // (matches the screenshot's top row).
    expect(overview[0].key).toBe("profit-and-loss");
  });
});

describe("findReport", () => {
  it("returns the matching entry for a known key", () => {
    const r = findReport("profit-and-loss");
    expect(r).toBeDefined();
    expect(r!.name).toBe("Profit and Loss");
  });

  it("returns undefined for an unknown key", () => {
    expect(findReport("not-a-real-report")).toBeUndefined();
  });
});
