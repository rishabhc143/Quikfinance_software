import { NextRequest, NextResponse } from "next/server";
import { assertCronAuthorized } from "@/lib/sales/cron";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase S6 implements the full recurring-invoice generation loop. Phase S1
 * registers the route so vercel.json's schedule resolves; the handler
 * returns ok with no-op until S6 lands.
 */
export async function GET(req: NextRequest) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;
  return NextResponse.json({ ok: true, processed: 0, note: "Phase S6 stub — no-op until recurring generator is wired" });
}
