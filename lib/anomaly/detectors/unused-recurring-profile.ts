import "server-only";

/**
 * AD-v3 — Unused recurring profile detector.
 *
 * Fires when a recurring Invoice/Bill/Expense profile is ACTIVE
 * but hasn't generated an occurrence in `UNUSED_DAYS` (default 60)
 * — and its frequency would have generated MORE than zero in
 * that window.
 *
 * Why this matters:
 *   - An "ACTIVE" recurring profile that hasn't fired in 60 days
 *     is almost certainly broken (cron stuck, template incomplete,
 *     end-date hit but status not flipped to EXPIRED, etc.)
 *   - Different from the existing missing_recurring detector
 *     (CF-7) which fires on a 2-day-overdue threshold for "should
 *     fire NOW". This one catches the "should have fired AT ALL"
 *     class — useful for monthly+ profiles that may not be
 *     individually late but haven't run in a long time.
 *
 * Severity:
 *   - HIGH if > 90 days unused AND frequency is daily/weekly
 *     (those should have fired many times by now)
 *   - MEDIUM otherwise
 *
 * Skip:
 *   - Profiles with occurrencesGenerated = 0 (never run — they're
 *     a new profile that hasn't triggered yet, not a stale one)
 *   - Profiles where endDate is in the past (legitimately
 *     finished)
 */

import { db } from "@/lib/db";
import type { DetectedAnomaly, DetectorFn } from "../types";
import { fpKey } from "../util";

const UNUSED_DAYS = 60;
const HIGH_SEVERITY_DAYS = 90;
const HIGH_FREQ_KEYWORDS = ["DAILY", "WEEKLY"];

/** A recurring profile row (uniform across Invoice/Bill/Expense). */
type ProfileRow = {
  id: string;
  profileName: string;
  frequency: string;
  endDate: Date | null;
  neverExpires: boolean;
};

async function lastOccurrenceDate(
  table: "invoice" | "bill",
  organizationId: string,
  profileId: string
): Promise<Date | null> {
  if (table === "invoice") {
    const last = await db.invoice.findFirst({
      where: { organizationId, recurringInvoiceId: profileId, deletedAt: null },
      orderBy: { issueDate: "desc" },
      select: { issueDate: true },
    });
    return last?.issueDate ?? null;
  } else {
    const last = await db.bill.findFirst({
      where: { organizationId, recurringBillId: profileId, deletedAt: null },
      orderBy: { issueDate: "desc" },
      select: { issueDate: true },
    });
    return last?.issueDate ?? null;
  }
}

export const detectUnusedRecurringProfile: DetectorFn = async (
  organizationId,
  today
) => {
  const cutoff = new Date(today.getTime() - UNUSED_DAYS * 86400000);

  const [riProfiles, rbProfiles] = await Promise.all([
    db.recurringInvoice.findMany({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      select: {
        id: true,
        profileName: true,
        frequency: true,
        endDate: true,
        neverExpires: true,
        occurrencesGenerated: true,
      },
    }),
    db.recurringBill.findMany({
      where: { organizationId, deletedAt: null, status: "ACTIVE" },
      select: {
        id: true,
        profileName: true,
        frequency: true,
        endDate: true,
        neverExpires: true,
      },
    }),
  ]);

  const out: DetectedAnomaly[] = [];

  async function evaluate(
    profile: ProfileRow & { occurrencesGenerated?: number },
    kind: "recurring_invoice" | "recurring_bill",
    table: "invoice" | "bill",
    label: string
  ) {
    // Skip ended profiles.
    if (!profile.neverExpires && profile.endDate && profile.endDate < today) return;
    // Skip never-run-yet profiles (occurrencesGenerated check —
    // recurringBill doesn't have it so default to "skip if no
    // occurrence found").
    const lastFired = await lastOccurrenceDate(table, organizationId, profile.id);
    if (!lastFired) {
      if (profile.occurrencesGenerated === 0) return;
      // No history at all — treat as "never fired" which is
      // suspicious but not what THIS detector flags (missing_recurring
      // already covers that). Skip.
      return;
    }
    if (lastFired >= cutoff) return;
    const daysSince = Math.floor(
      (today.getTime() - lastFired.getTime()) / 86400000
    );
    const isHighFreq = HIGH_FREQ_KEYWORDS.includes(profile.frequency.toUpperCase());
    const severity: "high" | "medium" =
      daysSince >= HIGH_SEVERITY_DAYS && isHighFreq ? "high" : "medium";
    out.push({
      detectorKey: "unused_recurring_profile",
      severity,
      title: `${label} "${profile.profileName}" hasn't fired in ${daysSince} days`,
      description:
        `Recurring profile "${profile.profileName}" (${profile.frequency.toLowerCase()}) ` +
        `is marked ACTIVE but its last generated ${label.toLowerCase()} was on ` +
        `${lastFired.toISOString().slice(0, 10)} (${daysSince} days ago). ` +
        `Either the cron is stuck or the profile should be PAUSED/EXPIRED. ` +
        `Check Settings → Recurring ${label}s.`,
      refType: kind,
      refId: profile.id,
      fingerprint: fpKey("unused_recurring_profile", [profile.id]),
    });
  }

  for (const p of riProfiles) {
    await evaluate(
      p as ProfileRow & { occurrencesGenerated: number },
      "recurring_invoice",
      "invoice",
      "Invoice"
    );
  }
  for (const p of rbProfiles) {
    await evaluate(p as ProfileRow, "recurring_bill", "bill", "Bill");
  }

  return out;
};
