import { NextRequest, NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/sales/cron";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily sweep that flips Sent / Partially Paid invoices to Overdue
 * when the due date has passed and there's still amount due.
 *
 * Audit r2 B.1: collapsed the previous `findMany → for-loop → update`
 * (one round-trip per invoice — at 10k+ rows it hit the Vercel
 * function timeout) into a single SQL UPDATE. Prisma's `updateMany`
 * can't express `total > "amountPaid"` (column vs column), so we use
 * `$executeRaw` directly. The where-clause filters the same set the
 * old code did:
 *
 *   - status IN ('SENT', 'PARTIALLY_PAID')
 *   - dueDate < now()
 *   - deletedAt IS NULL
 *   - total > amountPaid (positive outstanding balance)
 *
 * Idempotent: the where-clause excludes rows already in OVERDUE, so
 * re-runs are no-ops.
 *
 * Returns the row count updated. The previous `scanned` field is
 * gone — we don't load rows into memory anymore.
 */
export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const updated = await db.$executeRaw`
    UPDATE "Invoice"
    SET "status" = 'OVERDUE'
    WHERE "status" IN ('SENT', 'PARTIALLY_PAID')
      AND "dueDate" < NOW()
      AND "deletedAt" IS NULL
      AND "total" > "amountPaid"
  `;

  return NextResponse.json({ ok: true, updated });
}
