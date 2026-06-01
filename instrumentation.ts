/**
 * Next.js boot hook. Runs once when each serverless function instance
 * cold-starts. We use it to apply any pending Prisma migrations
 * automatically — without this, every deploy that adds a migration
 * would silently break Sales pages until someone curls
 * `/api/admin/migrate` manually.
 *
 * Why not put this in the build script? Vercel does not expose
 * Sensitive env vars (DATABASE_URL / DIRECT_URL on this project) to
 * the build environment. Runtime functions, however, do get them.
 *
 * Gates:
 *  - Skip on the Edge runtime (no Node APIs available)
 *  - Skip unless `QUIK_MIGRATE_ON_BOOT=1` is set in the env so devs
 *    running locally don't accidentally run migrations against
 *    arbitrary databases, AND so steady-state prod doesn't pay the
 *    ~500-1500ms migration-table-scan cost on every cold function
 *    start. Was previously `QUIK_AUTO_MIGRATE=1` — renamed to make
 *    its intent explicit and to force a deliberate re-enable when
 *    shipping a migration (default OFF in prod).
 *  - Module-level `attempted` flag so each process tries at most
 *    once per cold-start.
 *
 * Workflow when shipping a migration:
 *  1. Push the migration PR.
 *  2. Either (a) hit `POST /api/admin/migrate` with the migration
 *     key once after the deploy goes live (preferred — zero cold-start
 *     overhead afterward), OR (b) temporarily set
 *     `QUIK_MIGRATE_ON_BOOT=1` in Vercel before pushing, then unset it
 *     after the next cold start has run the migration.
 *
 * Idempotent at the SQL layer: `runPendingMigrations` skips rows
 * already recorded in `_prisma_migrations`. Concurrent function
 * instances racing on the same DB are fine — Postgres handles
 * row-level locking.
 *
 * Safety: errors are swallowed (logged via console.error) so a bad
 * migration doesn't take the whole server down. The
 * `/api/admin/migrate` endpoint can be hit manually for diagnostics.
 */

let attempted = false;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.QUIK_MIGRATE_ON_BOOT !== "1") return;
  if (attempted) return;
  attempted = true;

  try {
    const { runPendingMigrations } = await import("./lib/admin/run-migrations");
    const r = await runPendingMigrations();
    const applied = r.results.filter((x) => x.status === "applied");
    const failed = r.results.filter((x) => x.status === "failed");
    if (applied.length || failed.length) {
      console.log(
        `[boot] migrations: applied=${applied.length} failed=${failed.length}`,
        applied.map((x) => x.name),
        failed.length ? failed : ""
      );
    }
  } catch (err) {
    console.error(
      "[boot] migration error:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
