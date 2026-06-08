"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

/**
 * BNK-A — refactored to the Bank/Credit Card account shape.
 *
 * Field reference (Screenshots 3 + 4):
 *   Both types  → name, accountCode, currency, bankName, description
 *   Bank only   → accountNumber, ifsc, isPrimary
 *   Credit card → (none of the bank-only fields)
 *
 * The legacy `accountType` String column stays in the DB for backward
 * compat; we set it to a sensible value derived from `type` so older
 * code paths that read it don't break.
 */
const schema = z.object({
  type: z.enum(["BANK", "CREDIT_CARD"]).default("BANK"),
  name: z.string().min(1, "Account Name is required").max(120),
  accountCode: z.string().max(40).nullable().optional(),
  currency: z.string().min(3).max(8),
  // Bank-only fields — schema allows them on Credit Card but the form
  // hides them, so they arrive as empty/null in practice.
  accountNumber: z.string().max(40).nullable().optional(),
  bankName: z.string().max(120).nullable().optional(),
  ifsc: z.string().max(20).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  isPrimary: z.coerce.boolean().default(false),
  // BNK-A polish — opening balance amount + the date it was struck.
  // Both default to 0/null for back-compat with the old form payload.
  openingBalance: z.coerce.number().min(0).default(0),
  openingBalanceAsOf: z.coerce.date().nullable().optional(),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return schema.parse({
    type: raw.type ?? "BANK",
    name: raw.name,
    accountCode: raw.accountCode || null,
    currency: raw.currency,
    accountNumber: raw.accountNumber || null,
    bankName: raw.bankName || null,
    ifsc: raw.ifsc ? String(raw.ifsc).toUpperCase() : null,
    description: raw.description || null,
    isPrimary: raw.isPrimary === "true",
    openingBalance: raw.openingBalance || 0,
    // <input type="date"> sends "" when empty — pass through as null so
    // coerce.date doesn't try to parse it as a date and throw.
    openingBalanceAsOf: raw.openingBalanceAsOf
      ? String(raw.openingBalanceAsOf)
      : null,
  });
}

export async function createBankAccountAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = parse(formData);

  // Credit-card type doesn't carry isPrimary; force it false even if
  // someone managed to POST the checkbox state (e.g., toggled radio
  // after ticking the box).
  const isPrimary = data.type === "BANK" ? data.isPrimary : false;

  // If marking primary, demote any existing primary for this org.
  // Partial unique index would reject the insert otherwise.
  if (isPrimary) {
    await db.bankAccount.updateMany({
      where: {
        organizationId: organization.id,
        isPrimary: true,
        type: "BANK",
      },
      data: { isPrimary: false },
    });
  }

  const created = await db.bankAccount.create({
    data: {
      organizationId: organization.id,
      name: data.name,
      type: data.type,
      currency: data.currency,
      accountNumber: data.accountNumber,
      bankName: data.bankName,
      ifsc: data.ifsc,
      description: data.description,
      isPrimary,
      openingBalance: data.openingBalance,
      openingBalanceAsOf: data.openingBalanceAsOf ?? null,
      // Legacy free-text column kept in sync for any older code path that
      // still reads it. Drop in a future cleanup PR once nothing reads it.
      accountType: data.type === "CREDIT_CARD" ? "credit_card" : "checking",
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "BankAccount",
    entityId: created.id,
    after: {
      name: data.name,
      type: data.type,
      isPrimary,
      currency: data.currency,
      openingBalance: data.openingBalance,
      openingBalanceAsOf: data.openingBalanceAsOf?.toISOString() ?? null,
    },
  });
  revalidatePath("/banking");
  redirect(`/banking/accounts/${created.id}`);
}

export async function deleteBankAccountAction(id: string) {
  const { user, organization } = await requireOrganization();
  const a = await db.bankAccount.findFirst({
    where: { id, organizationId: organization.id },
  });
  if (!a) return { ok: false };
  const txnCount = await db.bankTransaction.count({
    where: { bankAccountId: id },
  });
  if (txnCount > 0) {
    await db.bankAccount.update({
      where: { id },
      data: { isActive: false },
    });
  } else {
    await db.bankAccount.delete({ where: { id } });
  }
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "BankAccount",
    entityId: id,
    before: { name: a.name },
  });
  revalidatePath("/banking");
  return { ok: true };
}
