import { NextRequest, NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/sales/cron";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily sweep that flips OPEN / PARTIALLY_PAID bills to OVERDUE when
 * the due date has passed and there's still a positive balance.
 * Mirrors `/api/cron/invoice-statuses`.
 *
 * vercel.json schedule: `45 2 * * *` (daily at 02:45 UTC).
 *
 * Audit r2 B.1: single `$executeRaw` UPDATE instead of
 * `findMany → for-loop → update`. See the invoice-statuses comment
 * for the full rationale.
 *
 * Idempotent: the where-clause excludes already-OVERDUE rows, so
 * re-runs are no-ops.
 */
export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const updated = await db.$executeRaw`
    UPDATE "Bill"
    SET "status" = 'OVERDUE'
    WHERE "status" IN ('OPEN', 'PARTIALLY_PAID')
      AND "dueDate" < NOW()
      AND "deletedAt" IS NULL
      AND "total" > "amountPaid"
  `;

  return NextResponse.json({ ok: true, updated });
}
