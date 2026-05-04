"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  name: z.string().min(1).max(120),
  accountNumber: z.string().max(40).optional().nullable(),
  accountType: z.enum(["checking", "savings", "credit_card", "cash", "wallet"]).default("checking"),
  currency: z.string().min(3).max(8),
  openingBalance: z.coerce.number().default(0),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return schema.parse({
    name: raw.name, accountNumber: raw.accountNumber || null,
    accountType: raw.accountType, currency: raw.currency,
    openingBalance: raw.openingBalance || 0,
  });
}

export async function createBankAccountAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = parse(formData);
  const created = await db.bankAccount.create({ data: { organizationId: organization.id, ...data } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "BankAccount", entityId: created.id, after: { name: data.name } });
  revalidatePath("/banking");
  redirect("/banking");
}

export async function deleteBankAccountAction(id: string) {
  const { user, organization } = await requireOrganization();
  const a = await db.bankAccount.findFirst({ where: { id, organizationId: organization.id } });
  if (!a) return { ok: false };
  const txnCount = await db.bankTransaction.count({ where: { bankAccountId: id } });
  if (txnCount > 0) {
    await db.bankAccount.update({ where: { id }, data: { isActive: false } });
  } else {
    await db.bankAccount.delete({ where: { id } });
  }
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "BankAccount", entityId: id, before: { name: a.name } });
  revalidatePath("/banking");
  return { ok: true };
}
