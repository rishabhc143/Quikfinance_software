/**
 * ACCT-E.2 — Pure helper for bulk-archive of Chart of Accounts
 * rows. Lives in `lib/` (not in `"use server"` actions.ts) so the
 * test suite can import it directly without dragging in Prisma /
 * NextAuth — and because `"use server"` files are forbidden from
 * exporting non-async values.
 *
 * Given the {id, code} pairs the user checked in the UI, returns:
 *   - `allowed` — ids the bulk-archive action can safely flip
 *   - `refused` — ids that are SYS-* (code-protected, would break
 *                  auto-posting if archived)
 */

export type CoaPartition = {
  allowed: string[];
  refused: string[];
};

export function partitionForBulkArchive(
  rows: Array<{ id: string; code: string | null }>
): CoaPartition {
  const allowed: string[] = [];
  const refused: string[] = [];
  for (const r of rows) {
    if (r.code?.startsWith("SYS-")) refused.push(r.id);
    else allowed.push(r.id);
  }
  return { allowed, refused };
}
