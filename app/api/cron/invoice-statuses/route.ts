import { NextRequest, NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/sales/cron";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily sweep that flips Sent invoices to Overdue when the due date has
 * passed and there is still amount due. Phase S5 wires the rest of the
 * status machine; this minimal sweep is enough to keep statuses correct.
 */
export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const now = new Date();
  const due = await db.invoice.findMany({
    where: {
      status: { in: ["SENT", "PARTIALLY_PAID"] },
      dueDate: { lt: now },
      deletedAt: null,
    },
    select: { id: true, total: true, amountPaid: true },
  });

  let updated = 0;
  for (const inv of due) {
    if (inv.total.toNumber() - inv.amountPaid.toNumber() > 0.0001) {
      await db.invoice.update({
        where: { id: inv.id },
        data: { status: "OVERDUE" },
      });
      updated += 1;
    }
  }

  return NextResponse.json({ ok: true, scanned: due.length, updated });
}
