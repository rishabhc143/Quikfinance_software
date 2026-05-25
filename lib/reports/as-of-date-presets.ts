/**
 * REPORTS-INFRA — "As of Date" preset resolver (single-date variant).
 *
 * The on-screen reference is Zoho's filter pill which lists 11 presets:
 *   Today, This Week, This Month, This Quarter, This Year,
 *   Yesterday, Previous Week, Previous Month, Previous Quarter,
 *   Previous Year, Custom.
 *
 * Implementation reuses `resolvePreset()` from `./date-range.ts` (the
 * same engine that powers P&L / Cash Flow's date-range picker). For
 * an "as of" single date we take `.end` of the returned range.
 *
 * Mapping (Zoho key → underlying ReportPreset):
 *   today              → today
 *   this-week          → this-week         (Mon-Sun, last day = Sunday)
 *   this-month         → this-month        (calendar month end)
 *   this-quarter       → this-quarter      (calendar quarter end)
 *   this-year          → this-fiscal-year  (Zoho's "This Year" = FY)
 *   yesterday          → yesterday
 *   previous-week      → last-week
 *   previous-month     → last-month
 *   previous-quarter   → last-quarter
 *   previous-year      → last-fiscal-year
 *   custom             → custom (caller supplies the date)
 *
 * Pure helper: no DOM, no Prisma. Safe to import from both server
 * components and client components.
 */

import { resolvePreset, type ReportPreset } from "./date-range";

export type AsOfPresetKey =
  | "today"
  | "this-week"
  | "this-month"
  | "this-quarter"
  | "this-year"
  | "yesterday"
  | "previous-week"
  | "previous-month"
  | "previous-quarter"
  | "previous-year"
  | "custom";

export const AS_OF_PRESET_LABEL: Record<AsOfPresetKey, string> = {
  today: "Today",
  "this-week": "This Week",
  "this-month": "This Month",
  "this-quarter": "This Quarter",
  "this-year": "This Year",
  yesterday: "Yesterday",
  "previous-week": "Previous Week",
  "previous-month": "Previous Month",
  "previous-quarter": "Previous Quarter",
  "previous-year": "Previous Year",
  custom: "Custom",
};

/** Canonical order matching Zoho's dropdown layout (top-to-bottom). */
export const AS_OF_PRESET_ORDER: readonly AsOfPresetKey[] = [
  "today",
  "this-week",
  "this-month",
  "this-quarter",
  "this-year",
  "yesterday",
  "previous-week",
  "previous-month",
  "previous-quarter",
  "previous-year",
  "custom",
] as const;

/** Mapping from Zoho-labelled keys to the underlying ReportPreset keys. */
const TO_REPORT_PRESET: Record<
  Exclude<AsOfPresetKey, "custom">,
  Exclude<ReportPreset, "custom">
> = {
  today: "today",
  "this-week": "this-week",
  "this-month": "this-month",
  "this-quarter": "this-quarter",
  "this-year": "this-fiscal-year",
  yesterday: "yesterday",
  "previous-week": "last-week",
  "previous-month": "last-month",
  "previous-quarter": "last-quarter",
  "previous-year": "last-fiscal-year",
};

/**
 * Resolve an AsOfPresetKey to a single Date (end-of-period semantics).
 *
 * @param key  the preset key
 * @param fiscalYearStartMonth 1..12 (1 = January = calendar-year FY,
 *   4 = April = India default). Only matters for `this-year` and
 *   `previous-year`.
 * @param now  anchor date — defaults to `new Date()`. Override in
 *   tests for reproducibility.
 * @returns the resolved as-of Date. For `custom`, returns `now`
 *   (caller should override with the user-supplied custom date).
 */
export function resolveAsOfPreset(
  key: AsOfPresetKey,
  fiscalYearStartMonth: number = 1,
  now: Date = new Date(),
): Date {
  if (key === "custom") return now;
  const reportPreset = TO_REPORT_PRESET[key];
  const range = resolvePreset(reportPreset, now, fiscalYearStartMonth);
  if (!range) return now;
  return range.end;
}

/**
 * Parse a URL search-param value into a valid AsOfPresetKey, or null.
 * Accepts either a single string or a string[] (Next.js search-param
 * shape). Case-sensitive — Zoho's keys are all lowercase.
 */
export function parseAsOfPreset(
  value: string | string[] | null | undefined,
): AsOfPresetKey | null {
  const s = Array.isArray(value) ? value[0] : value;
  if (!s) return null;
  if ((AS_OF_PRESET_ORDER as readonly string[]).includes(s)) {
    return s as AsOfPresetKey;
  }
  return null;
}

/**
 * Format a Date as `YYYY-MM-DD` in UTC. Matches the convention used
 * by `lib/reports/date-range.ts` so a value produced here will parse
 * cleanly back through `parseRangeFromSearchParams`.
 */
export function formatAsOfYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
