/**
 * REPORTS-INFRA — Pure helpers for the date-range filter that every
 * report uses. No Prisma or DOM imports — safe for unit
 * tests and for the client `<DateRangePicker>` to import.
 *
 * Concepts:
 *   - **Preset**: a named shortcut (This Month, Last Month, This
 *     Quarter, This FY, …). The user picks one and the picker
 *     resolves it to a concrete {start, end} pair.
 *   - **Fiscal year**: anchored to the org's `fiscalYearStart`
 *     month (1=Jan, 4=Apr for India). FY presets honor that.
 *
 * Convention: returned ranges are inclusive of both endpoints. The
 * `start` is at 00:00:00 UTC of the first day; the `end` is at
 * 23:59:59.999 UTC of the last day so Prisma `gte` / `lte` queries
 * include rows on the boundary days.
 */

export const REPORT_PRESETS = [
  "today",
  "yesterday",
  "this-week",
  "last-week",
  "this-month",
  "last-month",
  "this-quarter",
  "last-quarter",
  "this-year",
  "last-year",
  "this-fiscal-year",
  "last-fiscal-year",
  "custom",
] as const;

export type ReportPreset = (typeof REPORT_PRESETS)[number];

export const PRESET_LABEL: Record<ReportPreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "this-week": "This Week",
  "last-week": "Last Week",
  "this-month": "This Month",
  "last-month": "Last Month",
  "this-quarter": "This Quarter",
  "last-quarter": "Last Quarter",
  "this-year": "This Year",
  "last-year": "Last Year",
  "this-fiscal-year": "This Fiscal Year",
  "last-fiscal-year": "Last Fiscal Year",
  custom: "Custom",
};

export type DateRange = {
  start: Date;
  end: Date;
};

export function isReportPreset(s: string): s is ReportPreset {
  return (REPORT_PRESETS as readonly string[]).includes(s);
}

/** Start-of-day at 00:00:00 UTC. */
function startOfDayUtc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
}

/** End-of-day at 23:59:59.999 UTC. */
function endOfDayUtc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
}

/** Last day of a month (UTC-safe). */
function lastDayOfMonthUtc(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/**
 * Resolve a preset to a concrete date range, anchored at `now`.
 * Custom returns null (caller supplies from/to manually).
 *
 * @param preset one of the canonical preset names
 * @param now anchor time — defaults to `new Date()`, override for tests
 * @param fiscalYearStartMonth 1..12; only used by the fiscal-year
 *   presets. Defaults to 1 (calendar-year FY) when omitted.
 */
export function resolvePreset(
  preset: ReportPreset,
  now: Date = new Date(),
  fiscalYearStartMonth = 1
): DateRange | null {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  switch (preset) {
    case "today":
      return { start: startOfDayUtc(y, m, d), end: endOfDayUtc(y, m, d) };
    case "yesterday": {
      const dt = new Date(Date.UTC(y, m, d - 1));
      return {
        start: startOfDayUtc(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()),
        end: endOfDayUtc(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()),
      };
    }
    case "this-week": {
      // Week starts on Monday (ISO). getUTCDay() returns 0=Sun..6=Sat.
      const dow = now.getUTCDay();
      const daysSinceMonday = (dow + 6) % 7;
      const monday = new Date(Date.UTC(y, m, d - daysSinceMonday));
      const sunday = new Date(Date.UTC(y, m, d - daysSinceMonday + 6));
      return {
        start: startOfDayUtc(
          monday.getUTCFullYear(),
          monday.getUTCMonth(),
          monday.getUTCDate()
        ),
        end: endOfDayUtc(
          sunday.getUTCFullYear(),
          sunday.getUTCMonth(),
          sunday.getUTCDate()
        ),
      };
    }
    case "last-week": {
      const dow = now.getUTCDay();
      const daysSinceMonday = (dow + 6) % 7;
      const monday = new Date(Date.UTC(y, m, d - daysSinceMonday - 7));
      const sunday = new Date(Date.UTC(y, m, d - daysSinceMonday - 1));
      return {
        start: startOfDayUtc(
          monday.getUTCFullYear(),
          monday.getUTCMonth(),
          monday.getUTCDate()
        ),
        end: endOfDayUtc(
          sunday.getUTCFullYear(),
          sunday.getUTCMonth(),
          sunday.getUTCDate()
        ),
      };
    }
    case "this-month":
      return {
        start: startOfDayUtc(y, m, 1),
        end: endOfDayUtc(y, m, lastDayOfMonthUtc(y, m)),
      };
    case "last-month": {
      const lm = new Date(Date.UTC(y, m - 1, 1));
      const ly = lm.getUTCFullYear();
      const lmm = lm.getUTCMonth();
      return {
        start: startOfDayUtc(ly, lmm, 1),
        end: endOfDayUtc(ly, lmm, lastDayOfMonthUtc(ly, lmm)),
      };
    }
    case "this-quarter": {
      const qStart = Math.floor(m / 3) * 3;
      const qEnd = qStart + 2;
      return {
        start: startOfDayUtc(y, qStart, 1),
        end: endOfDayUtc(y, qEnd, lastDayOfMonthUtc(y, qEnd)),
      };
    }
    case "last-quarter": {
      const qStart = Math.floor(m / 3) * 3 - 3;
      const lqStart = new Date(Date.UTC(y, qStart, 1));
      const sy = lqStart.getUTCFullYear();
      const sm = lqStart.getUTCMonth();
      const em = sm + 2;
      return {
        start: startOfDayUtc(sy, sm, 1),
        end: endOfDayUtc(sy, em, lastDayOfMonthUtc(sy, em)),
      };
    }
    case "this-year":
      return {
        start: startOfDayUtc(y, 0, 1),
        end: endOfDayUtc(y, 11, 31),
      };
    case "last-year":
      return {
        start: startOfDayUtc(y - 1, 0, 1),
        end: endOfDayUtc(y - 1, 11, 31),
      };
    case "this-fiscal-year": {
      // FY starting month is 1-indexed. If we're past it in the
      // calendar year, the FY year-number equals the calendar year.
      // Otherwise it's the previous calendar year.
      const fyStartM = fiscalYearStartMonth - 1;
      const fyYear = m >= fyStartM ? y : y - 1;
      return fiscalYearRange(fyYear, fiscalYearStartMonth);
    }
    case "last-fiscal-year": {
      const fyStartM = fiscalYearStartMonth - 1;
      const fyYear = (m >= fyStartM ? y : y - 1) - 1;
      return fiscalYearRange(fyYear, fiscalYearStartMonth);
    }
    case "custom":
      return null;
  }
}

/** Range spanning a single fiscal year — first day at 00:00, last day at 23:59. */
function fiscalYearRange(
  fiscalYear: number,
  fiscalYearStartMonth: number
): DateRange {
  const startM = fiscalYearStartMonth - 1;
  if (fiscalYearStartMonth === 1) {
    return {
      start: startOfDayUtc(fiscalYear, 0, 1),
      end: endOfDayUtc(fiscalYear, 11, 31),
    };
  }
  // Non-calendar FY ends one day before the start month of the next FY.
  const endY = fiscalYear + 1;
  const endM = (startM + 11) % 12;
  return {
    start: startOfDayUtc(fiscalYear, startM, 1),
    end: endOfDayUtc(endY, endM, lastDayOfMonthUtc(endY, endM)),
  };
}

/**
 * Parse a report's date range out of URL search params.
 *
 * Accepts:
 *   - `preset=this-month` (named preset, server resolves it)
 *   - `from=2026-04-01&to=2026-06-30` (explicit ISO date custom range)
 *   - nothing → falls back to `defaultPreset`
 *
 * Returns the resolved `{start, end}` plus the preset name so the
 * UI can highlight the active button.
 */
export function parseRangeFromSearchParams(
  params: Record<string, string | string[] | undefined>,
  opts: {
    now?: Date;
    fiscalYearStartMonth?: number;
    defaultPreset?: ReportPreset;
  } = {}
): { range: DateRange; preset: ReportPreset } {
  const now = opts.now ?? new Date();
  const fyStart = opts.fiscalYearStartMonth ?? 1;
  const defPreset = opts.defaultPreset ?? "this-month";

  const presetRaw = stringOf(params.preset);
  if (presetRaw && isReportPreset(presetRaw)) {
    if (presetRaw === "custom") {
      const from = parseIsoDate(stringOf(params.from));
      const to = parseIsoDate(stringOf(params.to));
      if (from && to) {
        return {
          range: {
            start: startOfDayUtc(
              from.getUTCFullYear(),
              from.getUTCMonth(),
              from.getUTCDate()
            ),
            end: endOfDayUtc(
              to.getUTCFullYear(),
              to.getUTCMonth(),
              to.getUTCDate()
            ),
          },
          preset: "custom",
        };
      }
      // Custom requested but dates missing/invalid → fall through to default.
    } else {
      const resolved = resolvePreset(presetRaw, now, fyStart);
      if (resolved) return { range: resolved, preset: presetRaw };
    }
  }

  // No preset specified: support legacy from/to-only callers.
  const from = parseIsoDate(stringOf(params.from));
  const to = parseIsoDate(stringOf(params.to));
  if (from && to) {
    return {
      range: {
        start: startOfDayUtc(
          from.getUTCFullYear(),
          from.getUTCMonth(),
          from.getUTCDate()
        ),
        end: endOfDayUtc(
          to.getUTCFullYear(),
          to.getUTCMonth(),
          to.getUTCDate()
        ),
      },
      preset: "custom",
    };
  }

  const resolved = resolvePreset(defPreset, now, fyStart);
  return { range: resolved!, preset: defPreset };
}

function stringOf(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function parseIsoDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return dt;
}

/** Build a "?preset=…[&from=…&to=…]" query string for navigation. */
export function rangeToSearchParams(
  preset: ReportPreset,
  range: DateRange
): URLSearchParams {
  const p = new URLSearchParams();
  p.set("preset", preset);
  if (preset === "custom") {
    p.set("from", isoDate(range.start));
    p.set("to", isoDate(range.end));
  }
  return p;
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Compact "Apr 01, 2026 — Mar 31, 2027"-style label for display. */
export function formatRangeLabel(range: DateRange): string {
  const start = range.start;
  const end = range.end;
  return `${formatDate(start)} — ${formatDate(end)}`;
}

function formatDate(d: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(d.getUTCDate()).padStart(2, "0");
  const mon = months[d.getUTCMonth()];
  const yr = d.getUTCFullYear();
  return `${mon} ${day}, ${yr}`;
}
