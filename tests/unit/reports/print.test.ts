import { describe, it, expect } from "vitest";
import {
  buildPrintCss,
  DEFAULT_PRINT_PREFERENCES,
  type PrintPreferences,
} from "@/lib/reports/print";

/**
 * REPORTS — Print CSS builder tests.
 *
 * `buildPrintCss` produces the stylesheet injected just before
 * `window.print()` fires. The output is regular CSS — we don't
 * parse it back, but we DO want to guarantee that the user's
 * preference flips actually toggle the right rule. Otherwise the
 * Print Preference drawer becomes decoration.
 */

describe("buildPrintCss", () => {
  it("starts portrait by default and honors landscape flip", () => {
    const portrait = buildPrintCss(DEFAULT_PRINT_PREFERENCES);
    expect(portrait).toContain("size: A4 portrait");

    const landscape = buildPrintCss({
      ...DEFAULT_PRINT_PREFERENCES,
      orientation: "landscape",
    });
    expect(landscape).toContain("size: A4 landscape");
  });

  it("emits the page-number @bottom-center rule when enabled", () => {
    const withNumbers = buildPrintCss(DEFAULT_PRINT_PREFERENCES);
    expect(withNumbers).toContain("@bottom-center");
    expect(withNumbers).toContain('content: "Page "');
  });

  it("omits the page-number rule when disabled", () => {
    const prefs: PrintPreferences = {
      ...DEFAULT_PRINT_PREFERENCES,
      includePageNumbers: false,
    };
    const css = buildPrintCss(prefs);
    expect(css).not.toContain("@bottom-center");
  });

  it("hides header/footer markers when the user opted out", () => {
    const prefs: PrintPreferences = {
      ...DEFAULT_PRINT_PREFERENCES,
      includeHeaderFooter: false,
    };
    const css = buildPrintCss(prefs);
    expect(css).toContain('[data-print="footer"]');
    expect(css).toContain("display: none");
  });

  it("always hides app chrome markers", () => {
    const css = buildPrintCss(DEFAULT_PRINT_PREFERENCES);
    expect(css).toContain('[data-print="hide"]');
    expect(css).toContain(".no-print");
  });
});
