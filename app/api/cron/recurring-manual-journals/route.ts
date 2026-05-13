import { NextRequest, NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/sales/cron";
import { db } from "@/lib/db";
import {
  generateManualJournalFromProfile,
  advanceRecurringManualJournalCursor,
} from "@/lib/accounting/recurring-manual-journals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ACCT-A.4.c — Daily sweep for Recurring Manual Journals.
 *
 *   Find every RecurringManualJournal with status='ACTIVE' and
 *   nextOccurrenceDate <= now(). Generate a DRAFT ManualJournal
 *   from the profile's templateJson, then advance the cursor.
 *   Idempotent: re-running on the same day finds the existing
 *   same-day MJ via recurringManualJournalId + date-bucket and
 *   skips with a clean reason.
 *
 * vercel.json schedule: `0 4 * * *` (daily at 04:00 UTC) — picked
 * to fall outside the cluster of jobs already running at 02:xx.
 *
 * Generated journals land in DRAFT. The accountant reviews +
 * publishes via the regular Manual Journals list page.
 */
export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const now = new Date();
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const due = await db.recurringManualJournal.findMany({
    where: {
      status: "ACTIVE",
      isActive: true,
      deletedAt: null,
      nextOccurrenceDate: { lte: now },
    },
    select: { id: true },
    take: 200,
  });

  const results: Array<{
    id: string;
    manualJournalId: string | null;
    skipped: boolean;
    reason: string | null;
  }> = [];

  for (const r of due) {
    try {
      const gen = await generateManualJournalFromProfile(r.id, today);
      // Always advance the cursor — even on a "skipped because
      // already generated today" reason we want the next-date to
      // bump forward so we don't loop.
      await advanceRecurringManualJournalCursor(r.id, today);
      // Bump the occurrencesGenerated counter only on real success.
      if (gen.manualJournalId) {
        await db.recurringManualJournal.update({
          where: { id: r.id },
          data: { occurrencesGenerated: { increment: 1 } },
        });
      }
      results.push({
        id: r.id,
        manualJournalId: gen.manualJournalId,
        skipped: gen.skipped,
        reason: gen.reason ?? null,
      });
    } catch (err) {
      // Don't let one bad profile abort the whole run.
      results.push({
        id: r.id,
        manualJournalId: null,
        skipped: true,
        reason:
          err instanceof Error ? `error: ${err.message}` : "error: unknown",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: due.length,
    generated: results.filter((r) => r.manualJournalId).length,
    skipped: results.filter((r) => r.skipped).length,
    results,
  });
}
