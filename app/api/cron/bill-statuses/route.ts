import { NextRequest, NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/sales/cron";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily sweep that flips OPEN bills to OVERDUE when the due date has
 * passed and there's still a positive balance. Mirrors the Sales-side
 * `/api/cron/invoice-statuses` sweep (PR earlier in repo history).
 *
 * vercel.json schedule: `45 2 * * *` (daily at 02:45 UTC).
 *
 * Idempotent — the where-clause already filters to OPEN /
 * PARTIALLY_PAID rows, so re-running on a row that's already OVERDUE
 * leaves it alone.
 */
export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const now = new Date();
  const due = await db.bill.findMany({
    where: {
      status: { in: ["OPEN", "PARTIALLY_PAID"] },
      dueDate: { lt: now },
      deletedAt: null,
    },
    select: { id: true, total: true, amountPaid: true },
  });

  let updated = 0;
  for (const b of due) {
    if (b.total.toNumber() - b.amountPaid.toNumber() > 0.0001) {
      await db.bill.update({
        where: { id: b.id },
        data: { status: "OVERDUE" },
      });
      updated += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: due.length,
    updated,
  });
}
