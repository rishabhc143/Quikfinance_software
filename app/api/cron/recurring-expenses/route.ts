import { NextRequest, NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/sales/cron";
import { db } from "@/lib/db";
import {
  generateExpenseFromProfile,
  advanceRecurringExpenseCursor,
} from "@/lib/purchases/recurring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily sweep — per <recurring_expenses_spec>:
 *
 *   "Generate Expense rows from due RecurringExpense profiles. If
 *    isBillable=true and customerId set, expense becomes available
 *    in <BillableExpensesPanel> on the next invoice. Idempotent."
 *
 * vercel.json schedule: `30 2 * * *` (daily at 02:30 UTC, fifteen
 * minutes after the bills cron so any timing differences settle).
 *
 * Idempotency: hasExpenseForProfileToday blocks duplicates within
 * a calendar day.
 */
export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const due = await db.recurringExpense.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      isActive: true,
      nextRunAt: { lte: now },
    },
    select: { id: true },
    take: 200,
  });

  const results = [];
  for (const r of due) {
    try {
      const gen = await generateExpenseFromProfile(r.id, today);
      await advanceRecurringExpenseCursor(r.id, today);
      results.push({
        id: r.id,
        expenseId: gen.expenseId,
        skipped: gen.skipped,
        reason: gen.reason ?? null,
      });
    } catch (err) {
      results.push({
        id: r.id,
        expenseId: null,
        skipped: true,
        reason:
          err instanceof Error
            ? `error: ${err.message}`
            : "error: unknown",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: due.length,
    generated: results.filter((r) => r.expenseId).length,
    skipped: results.filter((r) => r.skipped).length,
    results,
  });
}
