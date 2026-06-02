/**
 * Audit r2 B.3: tiny bounded-concurrency helper used by the recurring
 * crons.
 *
 * The recurring-invoices/bills/expenses cron handlers used to process
 * up to 200 due profiles in a sequential `for ... await` loop. At
 * ~100ms per profile (DB transaction + numbering + audit log), that
 * was 20s of the 60s Vercel function budget — no margin for 500+
 * profiles. `mapPool(items, 8, fn)` runs `fn` over `items` with up to
 * `concurrency` in-flight at a time, preserving order in the result
 * array.
 *
 * Concurrency default of 8: the Neon WebSocket adapter pool max is
 * approximately 10 connections; 8 leaves headroom for sibling warm
 * functions in the same region. Crons in `vercel.json` are staggered
 * 15 min apart so cross-cron contention is rare.
 *
 * If `items` is empty or `concurrency <= 0`, returns an empty array
 * without spawning any workers.
 *
 * Errors thrown by `fn` for a particular item propagate — wrap your
 * per-item logic in try/catch upstream if you want the run to
 * continue past failures (see `app/api/cron/recurring-bills/route.ts`
 * for the pattern).
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0 || concurrency <= 0) return [];
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}
