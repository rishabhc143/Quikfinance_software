import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_ACCOUNTS } from "@/lib/accounting/coa-defaults";

/**
 * ACCT-E (+ ACCT-E.2 hotfix) — Backfill the Zoho-parity default
 * Chart of Accounts.
 *
 * Behavior:
 *   1. Loads the current set of account names in the org
 *      (case-insensitive).
 *   2. Computes which DEFAULT_ACCOUNTS rows are missing.
 *   3. Inserts only the missing ones via createMany.
 *
 * Why "by name" not "if empty": some orgs ship with a small set
 * of starter accounts (Cash / Accounts Receivable / Sales / etc.).
 * The old "count > 0 → skip" guard left those orgs with a sparse
 * list. The new logic merges: existing accounts stay untouched,
 * any missing Zoho-parity default gets added.
 *
 * Idempotent: re-running adds nothing because every default's
 * name is already in the existing set after the first pass.
 *
 * Returns the number of rows actually inserted (0 on steady state).
 */
export async function seedMissingDefaultCoa(
  organizationId: string
): Promise<number> {
  const existing = await db.chartOfAccount.findMany({
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

  const res = await db.chartOfAccount.createMany({
    data: toAdd.map((a) => ({
      organizationId,
      // Default rows seed with NO code so they don't collide with
      // any user-created codes (e.g. "1000 Cash"). Users can fill
      // codes in via the edit form later.
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

/**
 * Legacy alias kept so the list page's existing import doesn't
 * have to change in this hotfix. New code should call
 * `seedMissingDefaultCoa` directly.
 */
export const seedDefaultCoaIfEmpty = seedMissingDefaultCoa;
