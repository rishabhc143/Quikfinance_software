/**
 * ACCT-A.4.c — Helpers for the Recurring Manual Journals feature.
 *
 *   - `RecurringManualJournalTemplate` is the shape of the
 *     templateJson we store on each profile. The form serializes
 *     it on save; the cron deserializes it on each occurrence.
 *   - `generateManualJournalFromProfile` materialises one DRAFT
 *     ManualJournal + lines from a profile, idempotent against
 *     re-runs on the same day.
 *   - `advanceRecurringManualJournalCursor` bumps the
 *     `nextOccurrenceDate` after a successful generation and
 *     flips the profile to EXPIRED when the schedule's end is hit.
 *
 * Mirrors `lib/purchases/recurring.ts`'s pattern 1:1 so the cron
 * shape stays consistent across modules.
 */

import { db } from "@/lib/db";
import { startOfDay, endOfDay } from "date-fns";
import { computeNextOccurrence } from "@/lib/purchases/recurring";
import { nextDocumentNumber } from "@/lib/next-number";

// ────────────────────────── template shape ──────────────────────────

export type RecurringManualJournalTemplateLine = {
  accountId: string;
  contactId: string | null;
  projectId: string | null;
  debit: number;
  credit: number;
  description: string | null;
};

export type RecurringManualJournalTemplate = {
  /** Optional Reference# applied to every generated MJ. */
  referenceNumber: string | null;
  reportingMethod: "ACCRUAL_AND_CASH" | "ACCRUAL_ONLY" | "CASH_ONLY";
  currency: string | null;
  notes: string | null;
  lines: RecurringManualJournalTemplateLine[];
};

/**
 * Defensive deserialiser. Prisma stores `templateJson` as `Json?`;
 * we read it back as `unknown` and coerce. If the shape doesn't
 * match (e.g. a pre-PR profile somehow exists), return null and the
 * cron will mark the occurrence skipped with a clear reason.
 */
export function parseTemplate(
  raw: unknown
): RecurringManualJournalTemplate | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const lines = obj.lines;
  if (!Array.isArray(lines) || lines.length < 2) return null;
  const parsedLines: RecurringManualJournalTemplateLine[] = [];
  for (const l of lines) {
    if (!l || typeof l !== "object") return null;
    const line = l as Record<string, unknown>;
    if (typeof line.accountId !== "string" || !line.accountId) return null;
    parsedLines.push({
      accountId: line.accountId,
      contactId: typeof line.contactId === "string" ? line.contactId : null,
      projectId: typeof line.projectId === "string" ? line.projectId : null,
      debit: Number(line.debit ?? 0),
      credit: Number(line.credit ?? 0),
      description:
        typeof line.description === "string" ? line.description : null,
    });
  }
  return {
    referenceNumber:
      typeof obj.referenceNumber === "string" ? obj.referenceNumber : null,
    reportingMethod:
      obj.reportingMethod === "ACCRUAL_ONLY" ||
      obj.reportingMethod === "CASH_ONLY"
        ? obj.reportingMethod
        : "ACCRUAL_AND_CASH",
    currency: typeof obj.currency === "string" ? obj.currency : null,
    notes: typeof obj.notes === "string" ? obj.notes : null,
    lines: parsedLines,
  };
}

// ────────────────────────── idempotency check ──────────────────────────

/**
 * True iff a MJ already exists for this profile with a `date`
 * inside `today`'s [start, end] bucket. The cron uses this to
 * skip generation when it's been re-triggered on the same day.
 */
export async function hasManualJournalForProfileToday(
  recurringManualJournalId: string,
  today: Date
): Promise<boolean> {
  const found = await db.manualJournal.findFirst({
    where: {
      recurringManualJournalId,
      date: { gte: startOfDay(today), lte: endOfDay(today) },
    },
    select: { id: true },
  });
  return found !== null;
}

// ────────────────────────── generate ──────────────────────────

export type GenerateResult = {
  manualJournalId: string | null;
  skipped: boolean;
  reason?: string;
};

/**
 * Materialise one DRAFT ManualJournal from a profile's template.
 *
 * Why DRAFT? Mirrors RecurringBill semantics (the bill is DRAFT
 * until the AP reviewer opens it). For accruals an accountant
 * generally wants to glance at the figures before posting to the
 * ledger; the DRAFT can be batch-published from the list page.
 */
export async function generateManualJournalFromProfile(
  recurringManualJournalId: string,
  today: Date
): Promise<GenerateResult> {
  const profile = await db.recurringManualJournal.findUnique({
    where: { id: recurringManualJournalId },
  });
  if (!profile || profile.deletedAt) {
    return {
      manualJournalId: null,
      skipped: true,
      reason: "Profile not found or deleted",
    };
  }
  if (profile.status !== "ACTIVE" || !profile.isActive) {
    return {
      manualJournalId: null,
      skipped: true,
      reason: `Profile status is ${profile.status}`,
    };
  }
  if (await hasManualJournalForProfileToday(profile.id, today)) {
    return {
      manualJournalId: null,
      skipped: true,
      reason: "Already generated for today",
    };
  }

  const template = parseTemplate(profile.templateJson);
  if (!template) {
    return {
      manualJournalId: null,
      skipped: true,
      reason: "Profile template missing or malformed",
    };
  }

  const number = await nextDocumentNumber(
    profile.organizationId,
    "manualJournal"
  );

  const created = await db.$transaction(async (tx) => {
    const header = await tx.manualJournal.create({
      data: {
        organizationId: profile.organizationId,
        number,
        date: today,
        status: "DRAFT",
        notes: template.notes,
        referenceNumber: template.referenceNumber,
        reportingMethod: template.reportingMethod,
        currency: template.currency,
        recurringManualJournalId: profile.id,
        // Recurring profiles never auto-reverse for v1; reverse
        // dates are a single-MJ concept. User can add one in DRAFT.
        reverseJournalDate: null,
        publishReverseOnlyOnDate: false,
      },
    });
    await tx.manualJournalLine.createMany({
      data: template.lines.map((l, i) => ({
        manualJournalId: header.id,
        position: i,
        accountId: l.accountId,
        contactId: l.contactId,
        projectId: l.projectId,
        debit: l.debit,
        credit: l.credit,
        description: l.description,
      })),
    });
    return header;
  });

  return { manualJournalId: created.id, skipped: false };
}

// ────────────────────────── cursor advance ──────────────────────────

/**
 * Bump nextOccurrenceDate after a generation (or a skip — both
 * count toward "this day is done"). Flips to EXPIRED when the
 * computed next date overruns the profile's endDate.
 */
export async function advanceRecurringManualJournalCursor(
  recurringManualJournalId: string,
  current: Date
): Promise<void> {
  const profile = await db.recurringManualJournal.findUnique({
    where: { id: recurringManualJournalId },
  });
  if (!profile) return;
  const next = computeNextOccurrence(
    current,
    profile.frequency,
    profile.intervalN
  );
  const expired =
    !profile.neverExpires &&
    profile.endDate !== null &&
    next > profile.endDate;
  await db.recurringManualJournal.update({
    where: { id: recurringManualJournalId },
    data: {
      nextOccurrenceDate: next,
      ...(expired ? { status: "EXPIRED", isActive: false } : {}),
    },
  });
}
