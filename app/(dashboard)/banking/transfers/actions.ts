"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  date: z.coerce.date(),
  amount: z.coerce.number().positive(),
  reference: z.string().max(120).optional().nullable(),
});

export async function createBankTransferAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse({
    fromAccountId: formData.get("fromAccountId"),
    toAccountId: formData.get("toAccountId"),
    date: formData.get("date"),
    amount: formData.get("amount"),
    reference: formData.get("reference") || null,
  });
  if (data.fromAccountId === data.toAccountId) throw new Error("From and To accounts must differ");

  const [from, to] = await Promise.all([
    db.bankAccount.findFirst({ where: { id: data.fromAccountId, organizationId: organization.id } }),
    db.bankAccount.findFirst({ where: { id: data.toAccountId, organizationId: organization.id } }),
  ]);
  if (!from || !to) throw new Error("Account not found");

  const desc = `Transfer ${from.name} → ${to.name}${data.reference ? ` · ${data.reference}` : ""}`;
  await db.$transaction([
    db.bankTransaction.create({
      data: { organizationId: organization.id, bankAccountId: from.id, date: data.date, description: desc, reference: data.reference, amount: data.amount, type: "debit" },
    }),
    db.bankTransaction.create({
      data: { organizationId: organization.id, bankAccountId: to.id, date: data.date, description: desc, reference: data.reference, amount: data.amount, type: "credit" },
    }),
  ]);
  await writeAuditLog({
    organizationId: organization.id, userId: user.id,
    action: "CREATE", entityType: "BankTransfer", entityId: `${from.id}->${to.id}`,
    after: { from: from.name, to: to.name, amount: data.amount },
  });
  revalidatePath("/banking/transfers");
  revalidatePath("/banking/transactions");
  redirect("/banking/transfers");
}
