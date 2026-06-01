import { db } from "@/lib/db";

/**
 * Keep-Neon-warm ping. Wired into `vercel.json` to run every 4 minutes
 * via Vercel Cron, so Neon's free-tier compute never reaches the 30-min
 * idle threshold that triggers scale-to-zero. Without this, the next
 * user click after a quiet hour pays a ~1-2 second cold-compute boot
 * before the actual query runs.
 *
 * Trade-off (flag to the user): keeping Neon hot 24/7 costs ~720
 * compute-hours/month, which exceeds the free tier's ~191 hour cap.
 * Two options once that limit is hit:
 *   - Stay on the cron, pay Neon's Launch plan (~$19/mo) for always-on
 *     compute.
 *   - Disable this cron in `vercel.json` and accept the ~1-2s cold-start
 *     tax on first user click after idle.
 *
 * Endpoint is intentionally unauthenticated — Vercel Cron auto-signs
 * requests with a special header that Vercel enforces upstream. Even
 * if hit from the public internet, all it does is `SELECT 1`. No data
 * exposed, no writes performed.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true, ts: new Date().toISOString() });
  } catch (err) {
    // Don't bubble — a failed ping shouldn't take down the cron schedule.
    return Response.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
