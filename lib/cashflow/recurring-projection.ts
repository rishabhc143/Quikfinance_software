/**
 * CF-1 — Project future occurrences of a recurring profile.
 *
 * Used by the cashflow forecast engine to enumerate dates on which a
 * recurring invoice / bill / expense will hit the books inside a
 * forecast window.
 *
 * Frequency strings (per schema comments on RecurringInvoice/Bill/Expense):
 *   DAILY | WEEKLY | MONTHLY | EVERY_N_MONTHS | YEARLY
 * Some legacy rows use lower-case variants; we normalise to lower-case
 * before matching. Anything unrecognised falls back to monthly.
 *
 * The cron uses near-identical logic to GENERATE the next occurrence
 * when one comes due; this helper is the read-only "what's coming"
 * version. They must stay in sync — if cron changes, update here too.
 */

import { addDays, addMonths, addWeeks, addYears, isAfter, isBefore } from "date-fns";

export type RecurringProfileForProjection = {
  frequency: string;
  intervalN: number;
  startDate: Date | null;
  endDate: Date | null;
  neverExpires: boolean;
  /** Newer column. Falls back to `nextRunAt` when null. */
  nextOccurrenceDate: Date | null;
  /** Legacy column on every profile; always set. */
  nextRunAt: Date;
  /** Only ACTIVE profiles produce occurrences. PAUSED / STOPPED /
   *  EXPIRED return an empty array. */
  status: string;
  amount: number;
};

/** Safety cap so a malformed profile (e.g. frequency="daily", intervalN=0)
 *  can't lock the loop. 200 covers > 4 years of daily occurrences — well
 *  past any reasonable forecast horizon. */
const MAX_OCCURRENCES = 200;

/**
 * Returns ascending list of occurrence dates strictly within
 * [windowStart, windowEnd]. Both bounds are inclusive on day-of.
 */
export function projectOccurrences(
  profile: RecurringProfileForProjection,
  windowStart: Date,
  windowEnd: Date
): Date[] {
  if (profile.status !== "ACTIVE") return [];

  const occurrences: Date[] = [];

  // Starting cursor: prefer nextOccurrenceDate (newer column), fall
  // back to nextRunAt (legacy, always set).
  let cursor = new Date(profile.nextOccurrenceDate ?? profile.nextRunAt);

  // Horizon end is the earlier of (window end) and (profile end).
  // neverExpires means "ignore endDate".
  const horizon =
    !profile.neverExpires && profile.endDate && isBefore(profile.endDate, windowEnd)
      ? new Date(profile.endDate)
      : new Date(windowEnd);

  let safety = 0;
  while (!isAfter(cursor, horizon) && safety < MAX_OCCURRENCES) {
    if (!isBefore(cursor, windowStart)) {
      occurrences.push(new Date(cursor));
    }
    cursor = advanceCursor(cursor, profile.frequency, profile.intervalN);
    safety += 1;
  }

  return occurrences;
}

function advanceCursor(cursor: Date, frequency: string, intervalN: number): Date {
  const f = (frequency || "").toLowerCase();
  const n = Math.max(1, intervalN);
  if (f === "daily") return addDays(cursor, n);
  if (f === "weekly") return addWeeks(cursor, n);
  if (f === "monthly") return addMonths(cursor, n);
  if (f === "every_n_months") return addMonths(cursor, n);
  if (f === "yearly") return addYears(cursor, n);
  // Quarterly / fortnightly — accept common aliases.
  if (f === "quarterly") return addMonths(cursor, 3 * n);
  if (f === "fortnightly" || f === "biweekly") return addWeeks(cursor, 2 * n);
  // Unknown — degrade to monthly so the forecast still produces sensible
  // numbers rather than skipping the profile entirely.
  return addMonths(cursor, n);
}
