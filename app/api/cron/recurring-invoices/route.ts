import { NextRequest, NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/sales/cron";
import { db } from "@/lib/db";
import { generateRecurringOccurrence } from "@/lib/sales/recurring";
import { mapPool } from "@/lib/concurrency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily sweep: find every ACTIVE RecurringInvoice with nextOccurrenceDate
 * <= today and generate one occurrence each. Idempotent on
 * (recurringInvoiceId × occurrenceDate). Phase S6 generator lives in
 * `lib/sales/recurring.ts`.
 *
 * Audit r2 B.3: replaced the sequential `for ... await` loop with
 * `mapPool(due, 8, ...)` so up to 8 profiles process concurrently —
 * reduces wall-clock from ~20s (200 × 100ms) to ~2.5s. Also added
 * inner try/catch for parity with the bills + expenses crons — one
 * bad profile no longer aborts the whole run.
 */
export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const now = new Date();
  // Use start-of-day to keep occurrenceDate stable across the run
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const due = await db.recurringInvoice.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      nextOccurrenceDate: { lte: now },
    },
    select: { id: true },
    take: 200,
  });

  const results = await mapPool(due, 8, async (r) => {
    try {
      const out = await generateRecurringOccurrence(r.id, today);
      return { id: r.id, ...out };
    } catch (err) {
      return {
        id: r.id,
        invoiceId: null as string | null,
        skipped: true,
        reason:
          err instanceof Error
            ? `error: ${err.message}`
            : "error: unknown",
      };
    }
  });

  return NextResponse.json({
    ok: true,
    scanned: due.length,
    processed: results.filter((r) => r.invoiceId).length,
    skipped: results.filter((r) => !r.invoiceId).length,
    results,
  });
}
