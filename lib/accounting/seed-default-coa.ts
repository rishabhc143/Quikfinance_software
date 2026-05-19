import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_ACCOUNTS } from "@/lib/accounting/coa-defaults";

/**
 * ACCT-E (+ hotfixes) — Backfill the default Chart
 * of Accounts.
 *
 * Behavior:
 *   1. Wrap in a single transaction so concurrent first-loads
 *      see consistent state.
 *   2. Load the current set of account names in the org
 *      (case-insensitive).
 *   3. Compute which DEFAULT_ACCOUNTS rows are missing.
 *   4. createMany the missing ones with `skipDuplicates: true` —
 *      backed by the case-insensitive expression-index unique
 *      constraint added in migration 20260513000016 so even a
 *      stale-read race can't insert duplicates.
 *
 * Returns the number of rows actually inserted (0 on steady state).
 */
export async function seedMissingDefaultCoa(
  organizationId: string
): Promise<number> {
  return await db.$transaction(async (tx) => {
    const existing = await tx.chartOfAccount.findMany({
      where: { organizationId },
      select: { name: true },
    });
    const existingNames = new Set(
      existing.map((a) => a.name.trim().toLowerCase())
    );

    const toAdd = DEFAULT_ACCOUNTS.filter(
      (a) => !existingNames.has(a.name.trim().toLowerCase())
    );
    if (toAdd.length === 0) return 0;

    try {
      const res = await tx.chartOfAccount.createMany({
        data: toAdd.map((a) => ({
          organizationId,
          // Defaults seed with NO code so they don't collide with
          // user-created codes (e.g. "1000 Cash"). Users can fill
          // codes in via the edit form later.
          code: null,
          name: a.name,
          type: a.type,
          subType: a.subType,
          description: a.description ?? null,
          isActive: true,
        })),
        // skipDuplicates against the (org, LOWER(name)) unique
        // expression index — catches the race where a parallel
        // request already inserted the same defaults between our
        // findMany and our createMany.
        skipDuplicates: true,
      });
      return res.count;
    } catch (err) {
      // Defensive: any error in the createMany shouldn't break
      // the list page render. Log and return 0 so the page still
      // loads with whatever's already in the DB.
      console.error("[seedMissingDefaultCoa] insert failed:", err);
      return 0;
    }
  });
}

/**
 * Legacy alias kept so the list page's existing import doesn't
 * have to change in this hotfix. New code should call
 * `seedMissingDefaultCoa` directly.
 */
export const seedDefaultCoaIfEmpty = seedMissingDefaultCoa;
