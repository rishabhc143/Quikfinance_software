import { NextResponse } from "next/server";
import { runPendingMigrations } from "@/lib/admin/run-migrations";

/**
 * Admin endpoint that applies any pending Prisma migrations to the
 * production database. The actual logic lives in
 * `lib/admin/run-migrations.ts`; this is a thin auth-gated wrapper.
 *
 * Same helper is invoked automatically on serverless cold-start via
 * `instrumentation.ts` (gated by QUIK_AUTO_MIGRATE=1) — this endpoint
 * is the manual fallback.
 *
 * Auth: `x-migration-key` header must equal `MIGRATION_KEY` env var.
 *
 *   curl -X POST -H "x-migration-key: <secret>" \
 *     https://quikfinance-software.vercel.app/api/admin/migrate
 */

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const provided = req.headers.get("x-migration-key");
  const expected = process.env.MIGRATION_KEY;
  if (!expected || !provided || provided !== expected) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const result = await runPendingMigrations();
  return NextResponse.json(result);
}

export async function GET() {
  return new NextResponse(
    "Method Not Allowed. Use POST with x-migration-key header.",
    { status: 405 }
  );
}
