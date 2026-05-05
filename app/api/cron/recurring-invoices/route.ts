import { NextRequest, NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/sales/cron";
import { db } from "@/lib/db";
import { generateRecurringOccurrence } from "@/lib/sales/recurring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily sweep: find every ACTIVE RecurringInvoice with nextOccurrenceDate
 * <= today and generate one occurrence each. Idempotent on
 * (recurringInvoiceId × occurrenceDate). Phase S6 generator lives in
 * lib/sales/recurring.ts.
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

  const results = [];
  for (const r of due) {
    const out = await generateRecurringOccurrence(r.id, today);
    results.push({ id: r.id, ...out });
  }

  return NextResponse.json({
    ok: true,
    scanned: due.length,
    processed: results.filter((r) => r.invoiceId).length,
    skipped: results.filter((r) => !r.invoiceId).length,
    results,
  });
}
