/**
 * REPORTS — Print helpers.
 *
 * Three problems we solve here:
 *
 *  1. The report toolbar, sidebar, and date-filter strip don't belong
 *     on paper. We inject a `<style>` block that hides them before
 *     calling `window.print()`, then remove the style on the print
 *     dialog's `afterprint` event.
 *
 *  2. The report's centered Card (the inner header + table) is a
 *     reasonable print artifact as-is — preserving its tabular-nums
 *     amount column and section headers. We just force black text
 *     and remove background shading so it prints cleanly on grayscale
 *     printers.
 *
 *  3. User-tunable preferences (orientation, page numbers, header /
 *     footer toggle) are read from the print-preferences localStorage
 *     bucket and serialised into the `@page` rule.
 *
 * Server-renderable parts (the formatter for the preferences blob)
 * live alongside; the DOM-touching `triggerPrint()` is intentionally
 * a side-effecting client function.
 */

export type PrintPreferences = {
  orientation: "portrait" | "landscape";
  includePageNumbers: boolean;
  includeHeaderFooter: boolean;
};

export const DEFAULT_PRINT_PREFERENCES: PrintPreferences = {
  orientation: "portrait",
  includePageNumbers: true,
  includeHeaderFooter: true,
};

const STORAGE_KEY = "qf:report-print-preferences";

/** Read preferences from localStorage with safe defaults. */
export function loadPrintPreferences(): PrintPreferences {
  if (typeof window === "undefined") return DEFAULT_PRINT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRINT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<PrintPreferences>;
    return {
      orientation:
        parsed.orientation === "landscape" ? "landscape" : "portrait",
      includePageNumbers: parsed.includePageNumbers !== false,
      includeHeaderFooter: parsed.includeHeaderFooter !== false,
    };
  } catch {
    return DEFAULT_PRINT_PREFERENCES;
  }
}

export function savePrintPreferences(prefs: PrintPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota / private-mode — silently ignore. Defaults are fine.
  }
}

/** Build the CSS that gets injected just before window.print(). */
export function buildPrintCss(prefs: PrintPreferences): string {
  const pageRule = `
    @page {
      size: A4 ${prefs.orientation};
      margin: 18mm 14mm;
      ${
        prefs.includePageNumbers
          ? `@bottom-center { content: "Page " counter(page) " of " counter(pages); font-family: sans-serif; font-size: 10pt; color: #555; }`
          : ""
      }
    }
  `;

  return `
    ${pageRule}
    @media print {
      /* Hide app chrome */
      [data-print="hide"],
      nav, aside, header[role="banner"],
      .no-print {
        display: none !important;
      }

      /* Force light background + crisp text */
      html, body {
        background: #fff !important;
        color: #000 !important;
      }

      /* Cards lose their elevated styling on paper */
      [data-print="card"], .print-card {
        box-shadow: none !important;
        border: 1px solid #ccc !important;
      }

      /* Table rows shouldn't break in the middle */
      tr { page-break-inside: avoid; }
      thead { display: table-header-group; }
      tfoot { display: table-footer-group; }

      ${
        prefs.includeHeaderFooter
          ? ""
          : `
        /* User opted out of running header / footer */
        [data-print="footer"], [data-print="header"] {
          display: none !important;
        }
      `
      }
    }
  `;
}

/**
 * Inject the print CSS, call window.print(), and clean up the style
 * tag once the system print dialog dismisses. Idempotent — calling
 * twice in quick succession is harmless.
 */
export function triggerPrint(prefs?: PrintPreferences): void {
  if (typeof window === "undefined") return;
  const effective = prefs ?? loadPrintPreferences();
  const id = "qf-print-style";

  // Remove any stale tag first (e.g. a previous failed cleanup).
  document.getElementById(id)?.remove();

  const style = document.createElement("style");
  style.id = id;
  style.textContent = buildPrintCss(effective);
  document.head.appendChild(style);

  const cleanup = () => {
    document.getElementById(id)?.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  // Allow the style to apply before print() blocks the main thread.
  window.requestAnimationFrame(() => window.print());
}
