import { db } from "@/lib/db";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/**
 * Apply any Prisma migrations that haven't been recorded in the
 * `_prisma_migrations` table yet.
 *
 * Why this exists: Vercel does not expose Sensitive env vars
 * (DATABASE_URL / DIRECT_URL on this project) to the build
 * environment, so `prisma migrate deploy` in the build script can't
 * connect. At runtime those env vars ARE available, so we apply
 * pending migrations on boot via `instrumentation.ts` and as an
 * authenticated admin endpoint via `/api/admin/migrate`.
 *
 * Idempotent: rows in `_prisma_migrations` with `finished_at IS NOT
 * NULL` are skipped. Stops on first failure to avoid cascading into
 * a half-applied state — caller can re-invoke after fixing the bad
 * migration.
 */

export type MigrationResult =
  | { name: string; status: "already-applied" }
  | { name: string; status: "applied"; durationMs: number; statementCount: number }
  | { name: string; status: "failed"; error: string };

export async function runPendingMigrations(): Promise<{
  ok: boolean;
  results: MigrationResult[];
}> {
  // 1. Make sure _prisma_migrations exists (it normally does because
  //    earlier migrations created it, but a virgin DB wouldn't have it).
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

  // 2. Which migrations are already applied?
  const appliedRows = await db.$queryRawUnsafe<
    Array<{ migration_name: string }>
  >(
    `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`
  );
  const appliedSet = new Set(appliedRows.map((r) => r.migration_name));

  // 3. List migrations on disk in chronological order.
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
      // Prisma's $executeRawUnsafe sends queries via the prepared-
      // statement protocol; Postgres rejects multi-statement payloads
      // ("cannot insert multiple commands into a prepared statement").
      // Split into individual statements and execute one at a time.
      const statements = splitSqlStatements(sql);
      for (const stmt of statements) {
        await db.$executeRawUnsafe(stmt);
      }
      await db.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations"
           (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES ($1, $2, now(), $3, $4)`,
        id,
        checksum,
        name,
        statements.length
      );
      results.push({
        name,
        status: "applied",
        durationMs: Date.now() - start,
        statementCount: statements.length,
      });
    } catch (err) {
      results.push({
        name,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
      break;
    }
  }

  const ok = !results.some((r) => r.status === "failed");
  return { ok, results };
}

/**
 * Split a Postgres migration SQL string into individual statements,
 * stripping `--` line comments. Handles single-quoted string literals
 * (with `''` escape), `/* ... *\/` block comments, and `$tag$ ... $tag$`
 * dollar-quoted strings (used by PL/pgSQL function bodies).
 *
 * Not a full SQL parser, but covers everything Prisma migrations
 * generate: CREATE TABLE/INDEX, ALTER TABLE, INSERT, and DO blocks.
 */
export function splitSqlStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  const n = sql.length;
  let state: "normal" | "lineComment" | "blockComment" | "string" | "dollar" =
    "normal";
  let dollarTag = "";

  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (state === "normal") {
      if (ch === "-" && next === "-") {
        state = "lineComment";
        i += 2;
        continue;
      }
      if (ch === "/" && next === "*") {
        state = "blockComment";
        buf += "/*";
        i += 2;
        continue;
      }
      if (ch === "'") {
        state = "string";
        buf += ch;
        i += 1;
        continue;
      }
      if (ch === "$") {
        // Match $tag$ — tag is alphanumeric/underscore (or empty)
        const m = sql.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/);
        if (m) {
          dollarTag = m[0];
          buf += dollarTag;
          state = "dollar";
          i += dollarTag.length;
          continue;
        }
      }
      if (ch === ";") {
        const trimmed = buf.trim();
        if (trimmed.length > 0) out.push(trimmed);
        buf = "";
        i += 1;
        continue;
      }
      buf += ch;
      i += 1;
    } else if (state === "lineComment") {
      if (ch === "\n") {
        state = "normal";
        buf += "\n";
      }
      i += 1;
    } else if (state === "blockComment") {
      if (ch === "*" && next === "/") {
        buf += "*/";
        state = "normal";
        i += 2;
        continue;
      }
      buf += ch;
      i += 1;
    } else if (state === "string") {
      buf += ch;
      if (ch === "'") {
        if (next === "'") {
          buf += "'";
          i += 2;
          continue;
        }
        state = "normal";
      }
      i += 1;
    } else if (state === "dollar") {
      if (sql.slice(i).startsWith(dollarTag)) {
        buf += dollarTag;
        state = "normal";
        i += dollarTag.length;
        dollarTag = "";
        continue;
      }
      buf += ch;
      i += 1;
    }
  }
  const last = buf.trim();
  if (last.length > 0) out.push(last);
  return out;
}
