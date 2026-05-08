import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * One-off admin endpoint that applies any pending Prisma migrations
 * against the live database, then reports which were applied.
 *
 * **Why this exists:** Vercel doesn't run `prisma migrate deploy` at
 * build time when DATABASE_URL is marked "Sensitive" (which it is on
 * this project) — sensitive env vars aren't exposed to the build
 * environment by Vercel. So production has been silently drifting
 * since day 1 — every new migration was generated locally but never
 * applied to prod, and every server component that referenced a
 * not-yet-applied column/table crashed at SSR.
 *
 * Auth: protected by an `x-migration-key` header that must equal
 * `MIGRATION_KEY` env var. Returns 401 otherwise.
 *
 * To use:
 *   curl -X POST -H "x-migration-key: <secret>" \
 *     https://quikfinance-software.vercel.app/api/admin/migrate
 *
 * Idempotent: skips migrations already recorded in
 * `_prisma_migrations`. Stops on first failure.
 *
 * This is a "fix-it" endpoint and SHOULD be removed once production
 * is in sync. Until then, the auth gate keeps it locked down.
 */

export const runtime = "nodejs";
export const maxDuration = 60;

type MigrationResult =
  | { name: string; status: "already-applied" }
  | { name: string; status: "applied"; durationMs: number }
  | { name: string; status: "failed"; error: string };

export async function POST(req: Request) {
  const provided = req.headers.get("x-migration-key");
  const expected = process.env.MIGRATION_KEY;
  if (!expected || !provided || provided !== expected) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 1. Make sure _prisma_migrations exists (it normally does but a
  //    completely virgin DB wouldn't have it).
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);

  // 2. Which migrations have been applied successfully (finished_at IS NOT NULL)?
  const appliedRows = await db.$queryRawUnsafe<
    Array<{ migration_name: string }>
  >(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
  );
  const appliedSet = new Set(appliedRows.map((r) => r.migration_name));

  // 3. List migrations on disk in chronological order (numeric prefix
  //    sorts naturally).
  const migDir = path.join(process.cwd(), "prisma", "migrations");
  const dirents = await fs.readdir(migDir, { withFileTypes: true });
  const migNames = dirents
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const results: MigrationResult[] = [];

  for (const name of migNames) {
    if (appliedSet.has(name)) {
      results.push({ name, status: "already-applied" });
      continue;
    }
    const sqlPath = path.join(migDir, name, "migration.sql");
    let sql: string;
    try {
      sql = await fs.readFile(sqlPath, "utf8");
    } catch (err) {
      results.push({
        name,
        status: "failed",
        error: `Could not read ${sqlPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
      break;
    }

    const checksum = crypto.createHash("sha256").update(sql).digest("hex");
    const id = crypto.randomUUID();
    const start = Date.now();

    try {
      // Postgres handles multi-statement SQL via $executeRawUnsafe.
      // If a migration uses DO $$...$$ blocks, this still works
      // because the whole string is sent as one query.
      await db.$executeRawUnsafe(sql);
      await db.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations"
           (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES ($1, $2, now(), $3, 1)`,
        id,
        checksum,
        name
      );
      results.push({
        name,
        status: "applied",
        durationMs: Date.now() - start,
      });
    } catch (err) {
      results.push({
        name,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      // Stop on first failure so we don't cascade into a half-applied
      // state. Fix the bad migration, re-run the endpoint.
      break;
    }
  }

  const ok = !results.some((r) => r.status === "failed");
  return NextResponse.json({ ok, results });
}

// Reject GET — the endpoint is destructive.
export async function GET() {
  return new NextResponse("Method Not Allowed. Use POST with x-migration-key header.", {
    status: 405,
  });
}
