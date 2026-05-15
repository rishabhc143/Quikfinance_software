import { describe, it, expect } from "vitest";
import {
  formatReportActivityMessage,
  iconNameForEvent,
  type ReportActivityRow,
} from "@/lib/reports/activity";

/**
 * REPORTS — Activity formatter tests.
 *
 * `formatReportActivityMessage` is the on-screen sentence in the
 * Report Activity drawer's timeline. Wording must match Zoho's
 * (per screenshot) — testing pins the strings so a future refactor
 * that breaks the tone gets caught.
 */

function row(
  eventType: ReportActivityRow["eventType"],
  reportKey: string,
  eventData: ReportActivityRow["eventData"] = null
): Pick<ReportActivityRow, "eventType" | "reportKey" | "eventData"> {
  return { eventType, reportKey, eventData };
}

describe("formatReportActivityMessage", () => {
  it("EXPORT_PDF produces 'PDF generated for the \"<name>\" report.'", () => {
    expect(
      formatReportActivityMessage(row("EXPORT_PDF", "cash-flow-statement"))
    ).toBe('PDF generated for the "Cash Flow Statement" report.');
  });

  it("EXPORT_XLSX produces the XLSX wording", () => {
    expect(
      formatReportActivityMessage(row("EXPORT_XLSX", "profit-and-loss"))
    ).toBe('XLSX exported for the "Profit and Loss" report.');
  });

  it("EXPORT_CSV produces the CSV wording", () => {
    expect(
      formatReportActivityMessage(row("EXPORT_CSV", "balance-sheet"))
    ).toBe('CSV exported for the "Balance Sheet" report.');
  });

  it("PRINTED produces the printer wording", () => {
    expect(
      formatReportActivityMessage(row("PRINTED", "profit-and-loss"))
    ).toBe('"Profit and Loss" report sent to printer.');
  });

  it("CUSTOMIZED produces the customize wording", () => {
    expect(
      formatReportActivityMessage(row("CUSTOMIZED", "balance-sheet"))
    ).toBe('"Balance Sheet" report customized.');
  });

  it("SCHEDULE_CREATED includes recipient list (Phase B message)", () => {
    const msg = formatReportActivityMessage(
      row("SCHEDULE_CREATED", "cash-flow-statement", {
        recipients: ["alice@example.com", "bob@example.com"],
      })
    );
    expect(msg).toContain("Schedule Created");
    expect(msg).toContain("alice@example.com");
    expect(msg).toContain("bob@example.com");
  });

  it("SCHEDULE_CREATED with no recipients still produces a sentence", () => {
    expect(
      formatReportActivityMessage(row("SCHEDULE_CREATED", "profit-and-loss"))
    ).toContain("no recipients");
  });

  it("falls back to the raw key if catalog has no match", () => {
    expect(
      formatReportActivityMessage(row("EXPORT_PDF", "made-up-report"))
    ).toBe('PDF generated for the "made-up-report" report.');
  });
});

describe("iconNameForEvent", () => {
  it("returns sensible lucide icon names per event type", () => {
    expect(iconNameForEvent("EXPORT_PDF")).toBe("FileText");
    expect(iconNameForEvent("EXPORT_XLSX")).toBe("FileSpreadsheet");
    expect(iconNameForEvent("EXPORT_CSV")).toBe("FileType");
    expect(iconNameForEvent("PRINTED")).toBe("Printer");
    expect(iconNameForEvent("CUSTOMIZED")).toBe("SlidersHorizontal");
    expect(iconNameForEvent("SCHEDULE_CREATED")).toBe("CalendarPlus");
    expect(iconNameForEvent("SCHEDULE_PAUSED")).toBe("PauseCircle");
    expect(iconNameForEvent("SCHEDULE_DELETED")).toBe("CalendarX");
    expect(iconNameForEvent("SCHEDULE_SENT")).toBe("Send");
  });

  it("falls back to Circle for any unknown event (defensive)", () => {
    // Cast through unknown for an off-union string.
    expect(iconNameForEvent("WHATEVER" as never)).toBe("Circle");
  });
});
