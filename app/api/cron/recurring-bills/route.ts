import { NextRequest, NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/sales/cron";
import { db } from "@/lib/db";
import {
  generateBillFromProfile,
  advanceRecurringBillCursor,
} from "@/lib/purchases/recurring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily sweep — per <recurring_bills_spec>:
 *
 *   "Find RecurringBill where status='ACTIVE' AND nextOccurrenceDate
 *    <= now(). Generate Bill from templateJson with status=DRAFT
 *    (NOT auto-opened — user reviews and marks as Open manually).
 *    Increment occurrencesGenerated, compute next nextOccurrenceDate,
 *    check endDate. Idempotent via RecurringBillOccurrence log."
 *
 * vercel.json schedule: `15 2 * * *` (daily at 02:15 UTC).
 *
 * Idempotency: `hasBillForProfileToday` blocks the same-day duplicate.
 * The (vendor, billNumber) constraint was relaxed to a soft warning
 * in PR #101, so even cross-run number collisions just warn, never
 * block.
 */
export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const due = await db.recurringBill.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      isActive: true,
      // Either of the two cursor columns may be set on a profile —
      // the older code wrote nextRunAt, newer schema also tracks
      // nextOccurrenceDate. Check the effective trigger: nextRunAt
      // <= today.
      nextRunAt: { lte: now },
    },
    select: { id: true },
    take: 200,
  });

  const results = [];
  for (const r of due) {
    try {
      const gen = await generateBillFromProfile(r.id, today);
      await advanceRecurringBillCursor(r.id, today);
      results.push({
        id: r.id,
        billId: gen.billId,
        skipped: gen.skipped,
        reason: gen.reason ?? null,
      });
    } catch (err) {
      // Don't let one bad profile abort the whole run. Log + continue.
      results.push({
        id: r.id,
        billId: null,
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
    generated: results.filter((r) => r.billId).length,
    skipped: results.filter((r) => r.skipped).length,
    results,
  });
}
