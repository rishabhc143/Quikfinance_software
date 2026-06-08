import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAnomalyDetectors } from "@/lib/anomaly/run-all";
import { notifyHighSeverity } from "@/lib/anomaly/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Iterates every org serially. At ~10–30ms per org, even 1000 orgs
// fits comfortably inside 60s — but the default 10s would fail
// once we cross ~300 orgs. Set the Hobby ceiling explicitly.
export const maxDuration = 60;

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

  // AD-v2: pull org name too so the email digest is personalised.
  const orgs = await db.organization.findMany({
    select: { id: true, name: true },
  });
  const today = new Date();
  const results: Array<{
    organizationId: string;
    detected: number;
    inserted: number;
    skipped: number;
    emailsSent: number;
    error?: string;
  }> = [];

  for (const org of orgs) {
    try {
      const r = await runAnomalyDetectors(org.id, today);

      // AD-v2: digest-email HIGH-severity NEW alerts (if any).
      // Fetched fresh from DB so the email reflects what's actually
      // in the inbox after dedup.
      let emailsSent = 0;
      if (r.newHighSeverityIds.length > 0) {
        const newAlerts = await db.anomalyAlert.findMany({
          where: {
            id: { in: r.newHighSeverityIds },
            organizationId: org.id,
          },
          select: {
            id: true,
            detectorKey: true,
            severity: true,
            title: true,
            description: true,
          },
        });
        const notifyResult = await notifyHighSeverity({
          organizationId: org.id,
          organizationName: org.name,
          newAlerts,
        });
        emailsSent = notifyResult.emailsSent;
      }

      results.push({
        organizationId: org.id,
        detected: r.detected,
        inserted: r.inserted,
        skipped: r.skipped,
        emailsSent,
      });
    } catch (e) {
      results.push({
        organizationId: org.id,
        detected: 0,
        inserted: 0,
        skipped: 0,
        emailsSent: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const totals = results.reduce(
    (acc, r) => ({
      detected: acc.detected + r.detected,
      inserted: acc.inserted + r.inserted,
      skipped: acc.skipped + r.skipped,
      emailsSent: acc.emailsSent + r.emailsSent,
    }),
    { detected: 0, inserted: 0, skipped: 0, emailsSent: 0 }
  );

  return NextResponse.json({
    ok: true,
    orgs: orgs.length,
    totals,
    results,
  });
}
