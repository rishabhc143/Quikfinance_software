import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAnomalyDetectors } from "@/lib/anomaly/run-all";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CF-7 — Nightly anomaly-detection cron.
 *
 * Iterates every organization and runs the detector suite. We process
 * in serial (not Promise.all) because each org's DB queries are
 * already small + parallel internally; serial-across-orgs keeps the
 * Neon connection pool happy on Hobby tier.
 *
 * Vercel cron schedule: see vercel.json. Hobby tier supports daily-
 * only (`0 3 * * *` = 3am UTC). When we upgrade to Pro we'll switch
 * to twice-daily so high-severity alerts surface within hours rather
 * than next-morning.
 *
 * Returns a per-org summary so cron logs are useful when debugging
 * "why didn't I get an alert?" investigations.
 */
export async function GET(req: Request) {
  // Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. In dev
  // we accept any caller (no secret env set).
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get("Authorization");
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const orgs = await db.organization.findMany({ select: { id: true } });
  const today = new Date();
  const results: Array<{
    organizationId: string;
    detected: number;
    inserted: number;
    skipped: number;
    error?: string;
  }> = [];

  for (const org of orgs) {
    try {
      const r = await runAnomalyDetectors(org.id, today);
      results.push({ organizationId: org.id, ...r });
    } catch (e) {
      results.push({
        organizationId: org.id,
        detected: 0,
        inserted: 0,
        skipped: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const totals = results.reduce(
    (acc, r) => ({
      detected: acc.detected + r.detected,
      inserted: acc.inserted + r.inserted,
      skipped: acc.skipped + r.skipped,
    }),
    { detected: 0, inserted: 0, skipped: 0 }
  );

  return NextResponse.json({
    ok: true,
    orgs: orgs.length,
    totals,
    results,
  });
}
