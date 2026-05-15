/**
 * REPORTS — Scheduled report helpers (Phase B).
 *
 * Pure, side-effect-free helpers for:
 *  - parsing/validating the recipients list
 *  - computing the next `nextSendAt` given a frequency + an anchor
 *
 * Server actions (in `app/(dashboard)/reports/_actions/schedule.ts`)
 * and the cron worker (`app/api/cron/scheduled-reports/route.ts`)
 * both build on these.
 */

import { addDays, addMonths } from "date-fns";

export type ScheduleFrequency = "DAILY" | "WEEKLY" | "MONTHLY";
export type ScheduleFormat = "PDF" | "XLSX" | "CSV";
export type ScheduleStatus = "ACTIVE" | "PAUSED";

export const FREQUENCY_LABEL: Record<ScheduleFrequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
};

export const FORMAT_LABEL: Record<ScheduleFormat, string> = {
  PDF: "PDF",
  XLSX: "XLSX (Microsoft Excel)",
  CSV: "CSV",
};

/**
 * Compute the next firing date given a base date + frequency.
 *  - DAILY     → +1 day
 *  - WEEKLY    → +7 days
 *  - MONTHLY   → +1 month
 *
 * Always preserves the time-of-day from the base.
 */
export function advanceNextSendAt(
  base: Date,
  frequency: ScheduleFrequency
): Date {
  switch (frequency) {
    case "DAILY":
      return addDays(base, 1);
    case "WEEKLY":
      return addDays(base, 7);
    case "MONTHLY":
      return addMonths(base, 1);
  }
}

/**
 * Given a Start Date, advance forward in `frequency`-sized steps
 * until we land at a date that's > `now`. Used at create time so a
 * schedule with Start Date last Tuesday doesn't immediately fire
 * 6 times to "catch up".
 */
export function computeInitialNextSendAt(
  startDate: Date,
  frequency: ScheduleFrequency,
  now: Date
): Date {
  let next = startDate;
  // Hard guard: bail after 10_000 iterations to avoid an infinite
  // loop if someone passes a base in the year 1900.
  for (let i = 0; i < 10_000; i++) {
    if (next.getTime() > now.getTime()) return next;
    next = advanceNextSendAt(next, frequency);
  }
  return next;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Parse a free-form "a@b.com, c@d.com\n e@f.com" list into a clean
 * array of valid emails. Returns `{ valid, invalid }` so the caller
 * can surface bad addresses without losing the good ones.
 */
export function parseRecipients(input: string): {
  valid: string[];
  invalid: string[];
} {
  const tokens = input
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const t of tokens) {
    const lower = t.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    if (EMAIL_REGEX.test(t)) valid.push(t);
    else invalid.push(t);
  }
  return { valid, invalid };
}

/** Serialise the recipients list for DB storage (comma-separated). */
export function recipientsToDb(emails: string[]): string {
  return emails.join(",");
}

/** Deserialise the recipients column from DB storage. */
export function recipientsFromDb(stored: string): string[] {
  return stored
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Type-guard a free-form string against the frequency union. */
export function isScheduleFrequency(s: string): s is ScheduleFrequency {
  return s === "DAILY" || s === "WEEKLY" || s === "MONTHLY";
}

/** Type-guard for format. */
export function isScheduleFormat(s: string): s is ScheduleFormat {
  return s === "PDF" || s === "XLSX" || s === "CSV";
}

/**
 * Server-side helper: fetch the existing ScheduledReport for one
 * (user, org, reportKey) or null. Wraps Prisma in try/catch so a
 * missing table (migration lag) doesn't 500 the page — same
 * fail-open pattern as getRecentReportActivity.
 */
export async function getExistingSchedule(args: {
  organizationId: string;
  userId: string;
  reportKey: string;
}): Promise<{
  id: string;
  frequency: ScheduleFrequency;
  format: ScheduleFormat;
  status: "ACTIVE" | "PAUSED";
  nextSendAt: Date;
  startDate: Date;
  recipients: string[];
} | null> {
  // Import lazily so tests that don't touch the DB don't pull in
  // the Prisma client just to compile this module.
  const { db } = await import("@/lib/db");
  try {
    const row = await db.scheduledReport.findFirst({
      where: {
        organizationId: args.organizationId,
        userId: args.userId,
        reportKey: args.reportKey,
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return null;
    return {
      id: row.id,
      frequency: row.frequency as ScheduleFrequency,
      format: row.format as ScheduleFormat,
      status: row.status as "ACTIVE" | "PAUSED",
      nextSendAt: row.nextSendAt,
      startDate: row.startDate,
      recipients: recipientsFromDb(row.recipients),
    };
  } catch (err) {
    console.error("[reports/scheduled] getExistingSchedule failed", err);
    return null;
  }
}
