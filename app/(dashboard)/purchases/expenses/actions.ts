"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";

const schema = z.object({
  date: z.coerce.date(),
  category: z.string().min(1).max(80),
  amount: z.coerce.number().positive(),
  contactId: z.string().nullable().optional(),
  reference: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return schema.parse({
    date: raw.date,
    category: raw.category,
    amount: raw.amount,
    contactId: raw.contactId === "" ? null : raw.contactId,
    reference: raw.reference || null,
    notes: raw.notes || null,
  });
}

export async function createExpenseAction(formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = parse(formData);
  const created = await db.expense.create({
    data: { organizationId: organization.id, ...data },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Expense", entityId: created.id, after: { category: data.category, amount: data.amount } });
  revalidatePath("/purchases/expenses");
  redirect("/purchases/expenses");
}

export async function updateExpenseAction(id: string, formData: FormData) {
  const { user, organization } = await requireOrganization();
  const data = parse(formData);
  const before = await db.expense.findFirst({ where: { id, organizationId: organization.id } });
  if (!before) throw new Error("Not found");
  await db.expense.update({ where: { id }, data });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "UPDATE", entityType: "Expense", entityId: id, before: { amount: before.amount.toString() }, after: { amount: data.amount } });
  revalidatePath("/purchases/expenses");
  redirect("/purchases/expenses");
}

export async function deleteExpenseAction(id: string) {
  const { user, organization } = await requireOrganization();
  const e = await db.expense.findFirst({ where: { id, organizationId: organization.id } });
  if (!e) return { ok: false };
  await db.expense.delete({ where: { id } });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Expense", entityId: id, before: { category: e.category, amount: e.amount.toString() } });
  revalidatePath("/purchases/expenses");
  return { ok: true };
}
