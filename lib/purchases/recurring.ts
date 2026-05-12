import { db } from "@/lib/db";
import { startOfDay, endOfDay } from "date-fns";

/**
 * Purchases-side recurring helpers. Two crons consume these:
 *  - /api/cron/recurring-bills       generates Bills from active profiles
 *  - /api/cron/recurring-expenses    generates Expenses from active profiles
 *
 * Both are idempotent: re-running on the same day for the same profile
 * does NOT generate a duplicate row, because we check for a row whose
 * source-FK + issueDate-bucket matches the run.
 *
 * Per <recurring_bills_spec>:
 *  - Generated Bills are DRAFT (NOT auto-Open) — the user reviews and
 *    marks as Open.
 *  - Bill number defaults to `<profileName>-<YYYYMMDD>` so the (org,
 *    vendor, number) tuple is fresh; the user typically edits this in
 *    review.
 */

export type RecurringFrequency =
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly"
  | "WEEKLY"
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY"
  | "DAILY";

/**
 * Pure function: given a frequency string (any casing) and intervalN,
 * return the next-occurrence date. Mirrors lib/sales/recurring.ts'
 * `computeNextOccurrence` but accepts the lowercase strings the
 * Purchases models persist (e.g. RecurringBill.frequency: "monthly").
 */
export function computeNextOccurrence(
  current: Date,
  frequency: string,
  intervalN: number
): Date {
  const next = new Date(current);
  const f = frequency.toLowerCase();
  const n = Math.max(1, intervalN);
  switch (f) {
    case "daily":
      next.setDate(next.getDate() + n);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7 * n);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + n);
      break;
    case "quarterly":
      next.setMonth(next.getMonth() + 3 * n);
      break;
    case "yearly":
      next.setFullYear(next.getFullYear() + n);
      break;
    default:
      // Unknown frequency — bump a day so we don't loop on the same
      // row forever, but log a clear marker.
      next.setDate(next.getDate() + 1);
      break;
  }
  return next;
}

/**
 * Has a Bill already been generated for this profile on this calendar
 * day? Idempotency check.
 */
export async function hasBillForProfileToday(
  recurringBillId: string,
  today: Date
): Promise<boolean> {
  const existing = await db.bill.findFirst({
    where: {
      recurringBillId,
      deletedAt: null,
      issueDate: {
        gte: startOfDay(today),
        lte: endOfDay(today),
      },
    },
    select: { id: true },
  });
  return !!existing;
}

/**
 * Generate one Bill from a RecurringBill profile.
 *
 * Returns:
 *  - `{ billId, skipped: false }` on success
 *  - `{ billId: null, skipped: true, reason }` on idempotent skip or
 *    when the profile lacks required data
 */
export async function generateBillFromProfile(
  recurringBillId: string,
  today: Date
): Promise<{ billId: string | null; skipped: boolean; reason?: string }> {
  const profile = await db.recurringBill.findUnique({
    where: { id: recurringBillId },
  });
  if (!profile) return { billId: null, skipped: true, reason: "not-found" };
  if (profile.deletedAt) {
    return { billId: null, skipped: true, reason: "deleted" };
  }
  if (profile.status !== "ACTIVE" || !profile.isActive) {
    return { billId: null, skipped: true, reason: "not-active" };
  }
  if (!profile.contactId) {
    return { billId: null, skipped: true, reason: "no-vendor" };
  }

  // Idempotency: already a Bill for this profile today?
  if (await hasBillForProfileToday(recurringBillId, today)) {
    return { billId: null, skipped: true, reason: "already-generated-today" };
  }

  // Bill number: <profile-slug>-<YYYYMMDD>. The user can rename in
  // review; the (org, vendor, number) constraint is soft (PR #101).
  const slug = profile.profileName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  const dateTag = today.toISOString().slice(0, 10).replaceAll("-", "");
  const billNumber = `${slug || "rec"}-${dateTag}`;

  // Due date: today + 30 days as a default. Templates can override.
  const dueDate = new Date(today);
  dueDate.setDate(dueDate.getDate() + 30);

  // Parse templateJson (written by createRecurringBillAction). If
  // absent (legacy profile created before the multi-line form), fall
  // back to a single-line bill using profile.amount.
  type TemplateLine = {
    itemId?: string | null;
    name: string;
    description?: string | null;
    hsnSacCode?: string | null;
    accountId?: string | null;
    billableToCustomerId?: string | null;
    quantity: number;
    rate: number;
    taxId?: string | null;
    amount: number;
  };
  type Template = {
    referenceNumber?: string | null;
    paymentTermsId?: string | null;
    placeOfSupply?: string | null;
    currency?: string;
    subtotal?: number;
    discountValue?: number;
    discountType?: string;
    taxId?: string | null;
    taxTotal?: number;
    adjustmentLabel?: string | null;
    adjustmentValue?: number;
    total?: number;
    termsAndConditions?: string | null;
    lines?: TemplateLine[];
  };
  const tmpl = (profile.templateJson ?? null) as Template | null;
  const totalAmount =
    Number(tmpl?.total ?? profile.amount) || Number(profile.amount) || 0;

  const lines: TemplateLine[] =
    tmpl?.lines && tmpl.lines.length > 0
      ? tmpl.lines
      : [
          {
            name: profile.profileName,
            description: profile.profileName,
            quantity: 1,
            rate: totalAmount,
            amount: totalAmount,
          },
        ];

  const bill = await db.bill.create({
    data: {
      organizationId: profile.organizationId,
      number: billNumber,
      referenceNumber: tmpl?.referenceNumber ?? null,
      contactId: profile.contactId,
      recurringBillId: profile.id,
      status: "DRAFT", // per spec, never auto-Open
      issueDate: today,
      dueDate,
      paymentTermsId: tmpl?.paymentTermsId ?? null,
      placeOfSupply: tmpl?.placeOfSupply ?? null,
      currency: tmpl?.currency ?? "INR",
      subtotal: tmpl?.subtotal ?? totalAmount,
      discountValue: tmpl?.discountValue ?? 0,
      discountType: tmpl?.discountType ?? "percentage",
      taxId: tmpl?.taxId ?? null,
      taxTotal: tmpl?.taxTotal ?? 0,
      adjustmentLabel: tmpl?.adjustmentLabel ?? "Adjustment",
      adjustmentValue: tmpl?.adjustmentValue ?? 0,
      total: totalAmount,
      termsAndConditions: tmpl?.termsAndConditions ?? null,
      notes: `Generated from recurring profile "${profile.profileName}"`,
      lineItems: {
        create: lines.map((l, i) => ({
          itemId: l.itemId ?? null,
          position: i,
          name: l.name,
          description: l.description ?? l.name,
          hsnSacCode: l.hsnSacCode ?? null,
          accountId: l.accountId ?? null,
          billableToCustomerId: l.billableToCustomerId ?? null,
          quantity: l.quantity,
          rate: l.rate,
          taxId: l.taxId ?? null,
          amount: l.amount,
        })),
      },
    },
  });

  return { billId: bill.id, skipped: false };
}

/**
 * Advance a profile's nextRunAt + occurrencesGenerated after a run.
 * Marks status='EXPIRED' if the new nextRunAt is past endDate (and the
 * profile doesn't have neverExpires).
 */
export async function advanceRecurringBillCursor(
  recurringBillId: string,
  current: Date
): Promise<void> {
  const profile = await db.recurringBill.findUnique({
    where: { id: recurringBillId },
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
  await db.recurringBill.update({
    where: { id: recurringBillId },
    data: {
      nextRunAt: next,
      nextOccurrenceDate: next,
      ...(expired ? { status: "EXPIRED", isActive: false } : {}),
    },
  });
}

// ───── Expenses ───────────────────────────────────────────────────

export async function hasExpenseForProfileToday(
  recurringExpenseId: string,
  today: Date
): Promise<boolean> {
  const existing = await db.expense.findFirst({
    where: {
      recurringExpenseId,
      deletedAt: null,
      date: {
        gte: startOfDay(today),
        lte: endOfDay(today),
      },
    },
    select: { id: true },
  });
  return !!existing;
}

/**
 * Generate one Expense from a RecurringExpense profile. Billable
 * expenses surface on the customer's next Invoice via the billable-
 * expenses banner (PR #97).
 */
export async function generateExpenseFromProfile(
  recurringExpenseId: string,
  today: Date
): Promise<{ expenseId: string | null; skipped: boolean; reason?: string }> {
  const profile = await db.recurringExpense.findUnique({
    where: { id: recurringExpenseId },
  });
  if (!profile) return { expenseId: null, skipped: true, reason: "not-found" };
  if (profile.deletedAt) {
    return { expenseId: null, skipped: true, reason: "deleted" };
  }
  if (profile.status !== "ACTIVE" || !profile.isActive) {
    return { expenseId: null, skipped: true, reason: "not-active" };
  }

  if (await hasExpenseForProfileToday(recurringExpenseId, today)) {
    return {
      expenseId: null,
      skipped: true,
      reason: "already-generated-today",
    };
  }

  const amount = Number(profile.amount) || 0;

  const expense = await db.expense.create({
    data: {
      organizationId: profile.organizationId,
      date: today,
      category: profile.category ?? profile.profileName,
      expenseAccountId: profile.expenseAccountId,
      paidThroughAccountId: profile.paidThroughAccountId,
      amount,
      contactId: profile.contactId,
      customerId: profile.customerId,
      isBillable: profile.isBillable,
      recurringExpenseId: profile.id,
      notes:
        profile.notes ??
        `Generated from recurring profile "${profile.profileName}"`,
    },
  });

  return { expenseId: expense.id, skipped: false };
}

export async function advanceRecurringExpenseCursor(
  recurringExpenseId: string,
  current: Date
): Promise<void> {
  const profile = await db.recurringExpense.findUnique({
    where: { id: recurringExpenseId },
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
  await db.recurringExpense.update({
    where: { id: recurringExpenseId },
    data: {
      nextRunAt: next,
      nextOccurrenceDate: next,
      ...(expired ? { status: "EXPIRED", isActive: false } : {}),
    },
  });
}
