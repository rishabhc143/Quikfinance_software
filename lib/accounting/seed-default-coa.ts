import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_ACCOUNTS } from "@/lib/accounting/coa-defaults";
import { getOrCreateSystemAccount } from "@/lib/accounting/system-accounts";

/**
 * ACCT-E (+ hotfixes) — Backfill the default Chart of Accounts.
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
 *   5. PR #336: eager-seed the three foundational system accounts
 *      (AR, AP, SALES_REVENUE) so they appear in dropdowns
 *      immediately, before the user posts their first invoice/bill.
 *      Lookup is by `(orgId, code)` so this is idempotent —
 *      existing SYS-AR / SYS-AP / SYS-REV rows are preserved with
 *      whatever name they already have.
 *
 * Returns the total number of rows inserted (defaults + any newly-
 * created system accounts), 0 on steady state.
 */
export async function seedMissingDefaultCoa(
  organizationId: string
): Promise<number> {
  return await db.$transaction(async (tx) => {
    const existing = await tx.chartOfAccount.findMany({
      where: { organizationId },
      select: { name: true, code: true },
    });
    const existingNames = new Set(
      existing.map((a) => a.name.trim().toLowerCase())
    );
    const existingCodes = new Set(
      existing.map((a) => a.code).filter((c): c is string => !!c)
    );

    const toAdd = DEFAULT_ACCOUNTS.filter(
      (a) => !existingNames.has(a.name.trim().toLowerCase())
    );

    let insertedCount = 0;
    if (toAdd.length > 0) {
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
        insertedCount += res.count;
      } catch (err) {
        // Defensive: any error in the createMany shouldn't break
        // the list page render. Log and continue so we can still
        // try the system-account seeding.
        console.error("[seedMissingDefaultCoa] defaults insert failed:", err);
      }
    }

    // PR #336: eager-seed the three foundational SYS-* accounts that
    // are referenced by the deepest hot paths (invoice posting, bill
    // posting). Without this, "Sales", "Accounts Receivable", and
    // "Accounts Payable" don't appear in any picker until the user
    // posts their first invoice/bill — chicken-and-egg for the
    // item-form Account dropdown.
    const SYS_KINDS_TO_EAGER_SEED = ["AR", "AP", "SALES_REVENUE"] as const;
    for (const kind of SYS_KINDS_TO_EAGER_SEED) {
      try {
        const row = await getOrCreateSystemAccount(organizationId, kind, tx);
        if (row.code && !existingCodes.has(row.code)) {
          insertedCount += 1;
          existingCodes.add(row.code);
        }
      } catch (err) {
        console.error(
          `[seedMissingDefaultCoa] eager-seed ${kind} failed:`,
          err
        );
      }
    }

    return insertedCount;
  });
}

/**
 * Legacy alias kept so the list page's existing import doesn't
 * have to change in this hotfix. New code should call
 * `seedMissingDefaultCoa` directly.
 */
export const seedDefaultCoaIfEmpty = seedMissingDefaultCoa;
