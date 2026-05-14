import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_ACCOUNTS } from "@/lib/accounting/coa-defaults";

/**
 * ACCT-E — One-shot seed of the Zoho-parity default Chart of
 * Accounts.
 *
 * Called by the CoA list-page server component on every load. The
 * count-guard makes it a free no-op once the org has any non-SYS
 * accounts, so the cost is one indexed COUNT(*) on the steady-state
 * path.
 *
 * Idempotency contract:
 *   - The guard only seeds when an org has ZERO non-SYS accounts.
 *   - The createMany uses `skipDuplicates: true` against the
 *     `(organizationId, code)` unique constraint, so even a racing
 *     concurrent first-load can't double-seed.
 *   - SYS-* accounts are skipped (their names overlap with some
 *     defaults — see the omission list in `coa-defaults.ts`).
 *
 * Returns the number of rows actually inserted (0 on steady state).
 */
export async function seedDefaultCoaIfEmpty(
  organizationId: string
): Promise<number> {
  // Cheap guard — if any user-created account exists, skip.
  const nonSysCount = await db.chartOfAccount.count({
    where: {
      organizationId,
      OR: [{ code: null }, { code: { not: { startsWith: "SYS-" } } }],
    },
  });
  if (nonSysCount > 0) return 0;

  // First-time seed. createMany is one round-trip; skipDuplicates
  // makes it race-safe against a concurrent invocation.
  const res = await db.chartOfAccount.createMany({
    data: DEFAULT_ACCOUNTS.map((a) => ({
      organizationId,
      // Default seeds have no `code` — users can fill that in later
      // via the edit form. Leaving code NULL avoids collisions with
      // SYS-* codes and gives the unique constraint nothing to
      // complain about.
      code: null,
      name: a.name,
      type: a.type,
      subType: a.subType,
      description: a.description ?? null,
      isActive: true,
    })),
    skipDuplicates: true,
  });
  return res.count;
}
