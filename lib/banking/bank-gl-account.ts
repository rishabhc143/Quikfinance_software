import { db } from "@/lib/db";
import type { ChartOfAccount } from "@prisma/client";

/**
 * BNK-D — Bridge BankAccount → ChartOfAccount.
 *
 * For Money In Categorise we need a balanced 2-line JournalEntry. The
 * income leg is the GL account the user picked; the bank leg is the
 * bank account itself, represented as an ASSET entry in the Chart of
 * Accounts.
 *
 * Existing BankAccounts don't have a CoA entry — we lazy-create one
 * the first time a Money In Categorise fires. Subsequent calls return
 * the cached id. Idempotent: a concurrent first-categorise on the same
 * BankAccount finds the existing entry rather than producing a
 * duplicate.
 *
 * Naming + code:
 *   - name: "Bank: <BankAccount.name>"   (or "Credit Card: <name>" for CC)
 *   - code: "BNK-<short cuid prefix>"    (collision-safe across orgs)
 *   - type: ASSET                         (or LIABILITY for CREDIT_CARD)
 *
 * Returns the GL account row.
 */
export async function getOrCreateBankGLAccount(
  bankAccountId: string
): Promise<ChartOfAccount> {
  const bank = await db.bankAccount.findUniqueOrThrow({
    where: { id: bankAccountId },
    select: {
      id: true,
      name: true,
      type: true,
      organizationId: true,
      glAccountId: true,
      glAccount: true,
    },
  });

  // Fast path — already linked.
  if (bank.glAccount) return bank.glAccount;

  // Pick the right CoA type for this bank-account kind. Credit cards
  // are liabilities (you owe the issuer); regular bank + PayPal are
  // assets.
  const coaType = bank.type === "CREDIT_CARD" ? "LIABILITY" : "ASSET";
  const namePrefix = bank.type === "CREDIT_CARD" ? "Credit Card" : "Bank";

  // Concurrency-safe create: race-condition window is tiny but possible.
  // We catch the unique-constraint failure on `code` and fall back to a
  // re-read. The `code` uniqueness is per-org (`@@unique([organizationId, code])`).
  const code = `BNK-${bank.id.slice(-6)}`;

  try {
    const created = await db.chartOfAccount.create({
      data: {
        organizationId: bank.organizationId,
        name: `${namePrefix}: ${bank.name}`,
        code,
        type: coaType,
        description: `Auto-created by Banking Categorise for ${bank.name}`,
      },
    });
    await db.bankAccount.update({
      where: { id: bank.id },
      data: { glAccountId: created.id },
    });
    return created;
  } catch {
    // Lost the race or code-collision — re-read and reconcile.
    const refreshed = await db.bankAccount.findUniqueOrThrow({
      where: { id: bank.id },
      select: { glAccount: true },
    });
    if (refreshed.glAccount) return refreshed.glAccount;

    // Code collision in the same org but pointer not set — adopt it.
    const existing = await db.chartOfAccount.findFirst({
      where: { organizationId: bank.organizationId, code },
    });
    if (!existing) {
      throw new Error(
        `getOrCreateBankGLAccount: could not create or find a CoA entry for bank ${bank.id}`
      );
    }
    await db.bankAccount.update({
      where: { id: bank.id },
      data: { glAccountId: existing.id },
    });
    return existing;
  }
}
