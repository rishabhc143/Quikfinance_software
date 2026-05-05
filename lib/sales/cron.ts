import { NextRequest, NextResponse } from "next/server";

/**
 * Shared guard for cron route handlers. Vercel Cron passes the secret in
 * the `x-vercel-cron-secret` header (when configured) — for local/manual
 * triggering we accept `?secret=` query param matching CRON_SECRET.
 *
 * In dev when no CRON_SECRET is set, requests are allowed unconditionally
 * to keep manual debugging painless.
 */
export function assertCronAuthorized(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { ok: false, error: "CRON_SECRET not configured" },
        { status: 500 }
      );
    }
    return null;
  }
  const headerSecret = req.headers.get("x-vercel-cron-secret");
  const querySecret = req.nextUrl.searchParams.get("secret");
  if (headerSecret === expected || querySecret === expected) return null;
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}
