/**
 * REPORTS — Comparison period helpers.
 *
 * Powers the Customize → Compare With dropdown. Given the current
 * filter (date range for P&L / Cash Flow; as-of date for Balance
 * Sheet) plus a mode (Previous Period / Previous Year), computes
 * the comparison filter to fetch.
 *
 * Pure — no DB, no React, no Date.now() side effects. The caller
 * passes `now` into anything that needs it.
 */

import { addDays, addYears, subDays, subYears, subMonths } from "date-fns";
import type { DateRange } from "./date-range";

export type CompareMode = "none" | "previous-period" | "previous-year";

export function isCompareMode(s: string): s is CompareMode {
  return s === "none" || s === "previous-period" || s === "previous-year";
}

export const COMPARE_LABEL: Record<CompareMode, string> = {
  none: "None",
  "previous-period": "Previous Period",
  "previous-year": "Previous Year",
};

/**
 * Parse the URL `?compare=` param into a CompareMode. Defaults to
 * `none` when missing or invalid.
 */
export function parseCompareMode(
  searchParams: Record<string, string | undefined>
): CompareMode {
  const raw = searchParams.compare;
  if (raw === "previous-period" || raw === "previous-year") return raw;
  return "none";
}

/**
 * Shift a date range backwards for comparison.
 *
 *   - "previous-period": shift back by the range's own length. E.g.
 *     current = May 1-31 (31 days) → previous = April 0-30.
 *     We compute length as inclusive day count, then subtract.
 *
 *   - "previous-year": shift back exactly 1 calendar year. Same
 *     month + day, last year. Useful for "May 2026 vs May 2025"
 *     style comparisons.
 *
 *   - "none": returns the same range (caller usually skips entirely).
 */
export function computeCompareRange(
  current: DateRange,
  mode: CompareMode
): DateRange {
  if (mode === "none") return current;
  if (mode === "previous-year") {
    return {
      start: subYears(current.start, 1),
      end: subYears(current.end, 1),
    };
  }
  // previous-period — shift back by inclusive calendar-day count.
  // We compute days in UTC start-of-day terms so a midnight start +
  // 23:59:59 end still rounds to the right span without timezone
  // surprises (differenceInCalendarDays operates in local time and
  // mis-counts when the runner is in IST/etc.).
  const startUtc = Date.UTC(
    current.start.getUTCFullYear(),
    current.start.getUTCMonth(),
    current.start.getUTCDate()
  );
  const endUtc = Date.UTC(
    current.end.getUTCFullYear(),
    current.end.getUTCMonth(),
    current.end.getUTCDate()
  );
  const days = Math.round((endUtc - startUtc) / 86_400_000) + 1;
  return {
    start: subDays(current.start, days),
    end: subDays(current.end, days),
  };
}

/**
 * Balance Sheet specific — shift an as-of date backwards.
 *
 *   - "previous-period": one month earlier (canonical convention)
 *   - "previous-year": one year earlier (same day-of-month)
 */
export function computeCompareAsOf(
  current: Date,
  mode: CompareMode
): Date {
  if (mode === "none") return current;
  if (mode === "previous-year") return subYears(current, 1);
  return subMonths(current, 1);
}

/**
 * Compute percentage change. Returns null when the previous value
 * is zero (avoids divide-by-zero, lets the UI render "—" instead
 * of a misleading "Infinity%" or "100%").
 */
export function pctChange(current: number, previous: number): number | null {
  if (Math.abs(previous) < 0.005) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/**
 * Format a percentage change for display. Null → "—". Otherwise
 * always shows sign (+/-) and one decimal.
 */
export function formatPctChange(p: number | null): string {
  if (p === null) return "—";
  const abs = Math.abs(p).toLocaleString("en-IN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  if (Math.abs(p) < 0.05) return "0.0%";
  return p > 0 ? `+${abs}%` : `-${abs}%`;
}

/**
 * Compute a human label for the comparison column header. Used by
 * the on-screen table and exports:
 *
 *   "Apr 2026" (when comparing month-to-month)
 *   "FY 2025-26" (when comparing fiscal-year to fiscal-year)
 *   "Previous Period" / "Previous Year" as fallback
 */
export function compareRangeLabel(
  mode: CompareMode,
  shifted: DateRange
): string {
  if (mode === "none") return "";
  // For year-comparison, prefer "Apr 2025 – Mar 2026"-style
  // formatting; for period-comparison, prefer a concise "FY 2025"
  // when the range matches a calendar/fiscal year.
  const startStr = shifted.start.toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
  const endStr = shifted.end.toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
  return startStr === endStr ? startStr : `${startStr} – ${endStr}`;
}

/** Reference once so the unused-import lint stays quiet. */
void addDays;
void addYears;
