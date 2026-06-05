import "server-only";

/**
 * CF-7 — Detect ACTIVE recurring profiles that are overdue to fire
 * but haven't generated their next occurrence.
 *
 * Why this happens: cron failures, env mis-config, profile with
 * `endDate` in the past but `neverExpires=false` (so it silently
 * sits at status=ACTIVE but never runs), or a bug.
 *
 * The forecast engine uses `nextOccurrenceDate` (or `nextRunAt`)
 * to project — if that timestamp is in the past, the forecast
 * shows a phantom inflow / outflow on day 0 (since past-due
 * flows land there). Surfacing the underlying broken-profile is
 * the right fix.
 *
 * Threshold: nextOccurrenceDate older than 2 days. Anything within
 * 2 days is probably just "cron hasn't run yet today" — noise.
 */

import { db } from "@/lib/db";
import type { DetectedAnomaly, DetectorFn } from "../types";
import { fpKey } from "../util";

const OVERDUE_THRESHOLD_DAYS = 2;

export const detectMissingRecurring: DetectorFn = async (
  organizationId,
  today
) => {
  const cutoff = new Date(today.getTime() - OVERDUE_THRESHOLD_DAYS * 86400000);
  const out: DetectedAnomaly[] = [];

  // Inline the same shape for the three recurring tables — they
  // each have their own model but parallel columns. We could use
  // a $queryRaw UNION but three findManys are clearer and still
  // fast.
  // RecurringInvoice.nextOccurrenceDate is non-nullable (defaults to
  // now()), so a simple lt-cutoff filter is sufficient. RecurringBill
  // and RecurringExpense keep nextOccurrenceDate nullable on legacy
  // rows, so they OR in the nextRunAt fallback for those rows.
  const [overdueInvoices, overdueBills, overdueExpenses] = await Promise.all([
    db.recurringInvoice.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        nextOccurrenceDate: { lt: cutoff },
      },
      select: {
        id: true,
        profileName: true,
        nextOccurrenceDate: true,
        nextRunAt: true,
      },
    }),
    db.recurringBill.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        OR: [
          { nextOccurrenceDate: { lt: cutoff } },
          {
            AND: [
              { nextOccurrenceDate: null },
              { nextRunAt: { lt: cutoff } },
            ],
          },
        ],
      },
      select: {
        id: true,
        profileName: true,
        nextOccurrenceDate: true,
        nextRunAt: true,
      },
    }),
    db.recurringExpense.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: "ACTIVE",
        OR: [
          { nextOccurrenceDate: { lt: cutoff } },
          {
            AND: [
              { nextOccurrenceDate: null },
              { nextRunAt: { lt: cutoff } },
            ],
          },
        ],
      },
      select: {
        id: true,
        profileName: true,
        nextOccurrenceDate: true,
        nextRunAt: true,
      },
    }),
  ]);

  function push(
    profile: {
      id: string;
      profileName: string;
      nextOccurrenceDate: Date | null;
      nextRunAt: Date;
    },
    kind: "recurring_invoice" | "recurring_bill" | "recurring_expense",
    label: string
  ) {
    const expected = profile.nextOccurrenceDate ?? profile.nextRunAt;
    const daysLate = Math.round(
      (today.getTime() - expected.getTime()) / 86400000
    );
    out.push({
      detectorKey: "missing_recurring",
      severity: daysLate > 14 ? "high" : "medium",
      title: `${label} "${profile.profileName}" is ${daysLate} days overdue to generate`,
      description:
        `Recurring profile "${profile.profileName}" was due to fire on ` +
        `${expected.toISOString().slice(0, 10)} but no occurrence has been ` +
        `generated. Check Recurring ${label}s — either the cron is stuck or ` +
        `the profile's end-date has been reached without status=EXPIRED.`,
      refType: kind,
      refId: profile.id,
      fingerprint: fpKey("missing_recurring", [profile.id]),
    });
  }

  for (const p of overdueInvoices) push(p, "recurring_invoice", "Invoice");
  for (const p of overdueBills) push(p, "recurring_bill", "Bill");
  for (const p of overdueExpenses) push(p, "recurring_expense", "Expense");

  return out;
};
