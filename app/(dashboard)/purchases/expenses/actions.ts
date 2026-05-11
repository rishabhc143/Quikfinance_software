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

/**
 * Bulk delete expenses. Blocks any expense that's already been
 * pulled onto a customer Invoice (`isBilled=true`) — deleting it
 * would orphan a `BillableExpenseUsage` row.
 */
export async function bulkDeleteExpensesAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };

  const blocked = await db.expense.count({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      isBilled: true,
    },
  });
  if (blocked > 0) {
    return {
      ok: false,
      error: `${blocked} expense${
        blocked === 1 ? "" : "s"
      } already billed to a customer. Unbill from the Invoice first.`,
    };
  }

  const result = await db.expense.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "Expense",
    entityId: `bulk-delete-${Date.now()}`,
    before: { count: result.count, ids: input.ids },
  });
  revalidatePath("/purchases/expenses");
  return { ok: true, updated: result.count };
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
