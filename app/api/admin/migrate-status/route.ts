import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Read-only diagnostic endpoint: lists which migrations exist on
 * disk and which have been recorded as applied in the prod DB's
 * `_prisma_migrations` table. Useful when production pages start
 * crashing with "column does not exist" and you need to know
 * exactly which migrations need to run.
 *
 * No auth required — leaks nothing sensitive, only migration
 * NAMES (which are already public in the repo). The actual
 * apply step lives at POST /api/admin/migrate behind
 * MIGRATION_KEY.
 *
 * Returns:
 *   {
 *     applied: string[],   // migration_name values from the DB
 *     onDisk:  string[],   // migration directory names
 *     pending: string[],   // onDisk ∖ applied
 *     ok: true
 *   }
 *
 * To apply the pending list:
 *   curl -X POST -H "x-migration-key: <YOUR_KEY>" \
 *     https://<prod-host>/api/admin/migrate
 */

export const runtime = "nodejs";
// Skip static generation — the handler queries the live DB, and
// the build environment has no DATABASE_URL.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Migrations on disk (chronological order).
    const migDir = path.join(process.cwd(), "prisma", "migrations");
    const dirents = await fs.readdir(migDir, { withFileTypes: true });
    const onDisk = dirents
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();

    // 2. Migrations recorded as applied in the DB. Defensive: the
    //    `_prisma_migrations` table may not exist on a virgin DB.
    let applied: string[] = [];
    try {
      const rows = await db.$queryRawUnsafe<
        Array<{ migration_name: string }>
      >(
        `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
      );
      applied = rows.map((r) => r.migration_name).sort();
    } catch {
      // Table doesn't exist yet → applied is empty + all migrations
      // are pending. The migrate endpoint will create the table.
      applied = [];
    }

    const appliedSet = new Set(applied);
    const pending = onDisk.filter((n) => !appliedSet.has(n));

    return NextResponse.json({
      ok: true,
      onDisk,
      applied,
      pending,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
