"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";

const lineSchema = z.object({
  itemId: z.string().nullable().optional(),
  description: z.string().min(1).max(500),
  quantity: z.coerce.number().nonnegative(),
  rate: z.coerce.number().nonnegative(),
});

const schema = z.object({
  contactId: z.string().min(1),
  status: z.enum(["DRAFT", "OPEN", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"]).default("DRAFT"),
  issueDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(1),
});
export type BillInput = z.input<typeof schema>;

function totals(lines: { quantity: number; rate: number }[]) {
  const subtotal = lines.reduce((s, l) => s + l.quantity * l.rate, 0);
  return { subtotal, taxTotal: 0, total: subtotal };
}

export async function createBillAction(input: BillInput) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  const number = await nextDocumentNumber(organization.id, "bill");
  const t = totals(data.lines);
  const created = await db.bill.create({
    data: {
      organizationId: organization.id, number, contactId: data.contactId, status: data.status,
      issueDate: data.issueDate, dueDate: data.dueDate, notes: data.notes ?? null,
      subtotal: t.subtotal, taxTotal: t.taxTotal, total: t.total,
      lineItems: { create: data.lines.map((l) => ({ itemId: l.itemId || null, description: l.description, quantity: l.quantity, rate: l.rate, amount: l.quantity * l.rate })) },
    },
  });
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "CREATE", entityType: "Bill", entityId: created.id, after: { number: created.number, total: t.total } });
  revalidatePath("/purchases/bills");
  redirect(`/purchases/bills/${created.id}`);
}

export async function updateBillAction(id: string, input: BillInput) {
  const { user, organization } = await requireOrganization();
  const data = schema.parse(input);
  const before = await db.bill.findFirst({ where: { id, organizationId: organization.id } });
  if (!before) throw new Error("Not found");
  const t = totals(data.lines);
  await db.$transaction([
    db.billLineItem.deleteMany({ where: { billId: id } }),
    db.bill.update({
      where: { id },
      data: {
        contactId: data.contactId, status: data.status, issueDate: data.issueDate, dueDate: data.dueDate,
        notes: data.notes ?? null, subtotal: t.subtotal, taxTotal: t.taxTotal, total: t.total,
        lineItems: { create: data.lines.map((l) => ({ itemId: l.itemId || null, description: l.description, quantity: l.quantity, rate: l.rate, amount: l.quantity * l.rate })) },
      },
    }),
  ]);
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "UPDATE", entityType: "Bill", entityId: id, before: { total: before.total.toString() }, after: { total: t.total } });
  revalidatePath("/purchases/bills");
  revalidatePath(`/purchases/bills/${id}`);
  redirect(`/purchases/bills/${id}`);
}

/**
 * Bulk transitions used by the Bills list page's BulkAwareDataTable.
 *
 *  - bulkMarkBillsOpen: Draft bills → OPEN (the "I've reviewed it, it's
 *    real, I owe this" transition). Skips non-Draft rows silently.
 *  - bulkVoidBills: any non-void, non-paid → VOID + voidedAt timestamp.
 *    Paid bills can't be voided (would orphan PaymentMadeAllocation rows).
 *  - bulkDeleteBills: Draft → hard delete; others → soft-void with
 *    deletedAt set. Mirrors the single-id softDeleteBillAction policy.
 */
export async function bulkMarkBillsOpenAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const result = await db.bill.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      status: "DRAFT",
    },
    data: { status: "OPEN" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Bill",
    entityId: `bulk-open-${Date.now()}`,
    after: { count: result.count, ids: input.ids },
  });
  revalidatePath("/purchases/bills");
  return { ok: true, updated: result.count };
}

export async function bulkVoidBillsAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  // Paid bills block voiding — voiding would orphan their payment
  // allocations. Surface a clear error rather than silently skipping.
  const blocked = await db.bill.count({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      status: "PAID",
    },
  });
  if (blocked > 0) {
    return {
      ok: false,
      error: `${blocked} paid bill${
        blocked === 1 ? "" : "s"
      } block the void. Reverse the payments first.`,
    };
  }
  const result = await db.bill.updateMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      status: { notIn: ["VOID", "PAID"] },
    },
    data: { status: "VOID", voidedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Bill",
    entityId: `bulk-void-${Date.now()}`,
    after: { count: result.count, ids: input.ids },
  });
  revalidatePath("/purchases/bills");
  return { ok: true, updated: result.count };
}

export async function bulkDeleteBillsAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  // Soft-delete + flip status to VOID for non-drafts; hard-delete
  // draft rows (no business consequence — nothing is referencing
  // them yet). Match the single-id action's behavior.
  const drafts = await db.bill.findMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      status: "DRAFT",
    },
    select: { id: true },
  });
  const draftIds = new Set(drafts.map((d) => d.id));
  const nonDraftIds = input.ids.filter((id) => !draftIds.has(id));
  let total = 0;
  if (draftIds.size > 0) {
    const r1 = await db.bill.deleteMany({
      where: {
        id: { in: Array.from(draftIds) },
        organizationId: organization.id,
      },
    });
    total += r1.count;
  }
  if (nonDraftIds.length > 0) {
    const r2 = await db.bill.updateMany({
      where: {
        id: { in: nonDraftIds },
        organizationId: organization.id,
        deletedAt: null,
      },
      data: { deletedAt: new Date(), status: "VOID" },
    });
    total += r2.count;
  }
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "Bill",
    entityId: `bulk-delete-${Date.now()}`,
    before: { count: total, ids: input.ids },
  });
  revalidatePath("/purchases/bills");
  return { ok: true, updated: total };
}

export async function softDeleteBillAction(id: string) {
  const { user, organization } = await requireOrganization();
  const b = await db.bill.findFirst({ where: { id, organizationId: organization.id } });
  if (!b) return { ok: false };
  if (b.status === "DRAFT") {
    await db.bill.delete({ where: { id } });
  } else {
    await db.bill.update({ where: { id }, data: { deletedAt: new Date(), status: "VOID" } });
  }
  await writeAuditLog({ organizationId: organization.id, userId: user.id, action: "DELETE", entityType: "Bill", entityId: id, before: { number: b.number, status: b.status } });
  revalidatePath("/purchases/bills");
  return { ok: true };
}
