"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  bankAccountId: z.string().min(1),
  date: z.coerce.date(),
  description: z.string().min(1).max(500),
  reference: z.string().max(120).optional().nullable(),
  amount: z.coerce.number(),
  type: z.enum(["debit", "credit"]),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return schema.parse({
    bankAccountId: raw.bankAccountId,
    date: raw.date,
    description: raw.description,
    reference: raw.reference || null,
    amount: raw.amount,
    type: raw.type,
  });
}

export async function createTransactionAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = parse(formData);
  const created = await db.bankTransaction.create({
    data: { organizationId: organization.id, ...data },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "BankTransaction", entityId: created.id, after: { description: data.description, amount: data.amount } });
  revalidatePath("/banking/transactions");
  redirect("/banking/transactions");
}

export async function deleteTransactionAction(id: string) {
  const { user, organization } = await requireOrganization();
  const t = await db.bankTransaction.findFirst({ where: { id, organizationId: organization.id } });
  if (!t) return { ok: false };
  await db.bankTransaction.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "BankTransaction", entityId: id, before: { description: t.description } });
  revalidatePath("/banking/transactions");
  return { ok: true };
}
