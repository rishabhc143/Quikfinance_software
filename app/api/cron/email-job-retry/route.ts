import { NextRequest, NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/sales/cron";
import { drainPendingEmails } from "@/lib/sales/email-sender";

export const runtime = "nodejs";
// Cron only — never cache.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;
  const result = await drainPendingEmails(50);
  return NextResponse.json({ ok: true, ...result });
}
