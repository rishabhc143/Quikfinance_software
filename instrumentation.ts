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
 *  - Skip unless `QUIK_AUTO_MIGRATE=1` is set in the env so devs
 *    running locally don't accidentally run migrations against
 *    arbitrary databases
 *  - Module-level `attempted` flag so each process tries at most
 *    once per cold-start
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
  if (process.env.QUIK_AUTO_MIGRATE !== "1") return;
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
