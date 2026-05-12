"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { computeDocument } from "@/lib/sales/totals";
import { billSchema, type BillInput } from "@/lib/validations/bill";

export type { BillInput };

/**
 * Bill server actions.
 *
 * Spec (master prompt + audit):
 *   - Bill numbers are MANUAL. No NumberSeries lookup. The user
 *     types the vendor's source-doc number. Per <bills_spec>,
 *     duplicates per (orgId, contactId, number) are FLAGGED with a
 *     warning but ALLOWED — vendors sometimes restate. The unique
 *     constraint dropped in migration 20260513000000_bill_number_soft_dup.
 *   - Totals math is the shared Decimal-safe `computeDocument`.
 *   - Edit on a non-Draft bill is allowed for header fields, but
 *     PAID bills block edit (payments would orphan).
 *   - Each save persists `billableToCustomerId` per line so the
 *     <BillableExpensesBanner> on the Invoice form can pick them up.
 *   - When a Bill is created with `purchaseOrderId` set, the source
 *     PO's status flips ISSUED/PARTIALLY_BILLED → BILLED in the same
 *     action (acceptance #5).
 */

/**
 * Check whether a (vendor, billNumber) pair already exists. The form
 * calls this on Bill# blur; if a match is found we surface a yellow
 * warning toast but the user can save anyway. Idempotent + fast
 * (covered by the non-unique index from the soft-dup migration).
 *
 * `excludeBillId` lets the edit form skip "matches itself".
 */
export async function checkBillNumberDuplicateAction(input: {
  vendorId: string;
  number: string;
  excludeBillId?: string;
}): Promise<{
  duplicate: boolean;
  existing?: {
    id: string;
    number: string;
    issueDate: Date;
    status: string;
  };
}> {
  const { organization } = await requireOrganization();
  if (!input.vendorId || !input.number?.trim()) {
    return { duplicate: false };
  }
  const existing = await db.bill.findFirst({
    where: {
      organizationId: organization.id,
      contactId: input.vendorId,
      number: input.number.trim(),
      deletedAt: null,
      ...(input.excludeBillId ? { NOT: { id: input.excludeBillId } } : {}),
    },
    select: { id: true, number: true, issueDate: true, status: true },
    orderBy: { issueDate: "desc" },
  });
  if (!existing) return { duplicate: false };
  return { duplicate: true, existing };
}

async function totalsFor(orgId: string, input: BillInput) {
  const taxes = await db.tax.findMany({
    where: { organizationId: orgId, isActive: true },
    select: { id: true, rate: true },
  });
  const taxRate = (id?: string | null) =>
    (id ? taxes.find((t) => t.id === id)?.rate : null) ?? 0;
  const docTaxRate = input.documentTax
    ? Number(taxRate(input.documentTax.taxId))
    : 0;
  return computeDocument({
    lines: input.lines.map((l) => ({
      quantity: l.quantity ?? 0,
      rate: l.rate ?? 0,
      taxRate: Number(taxRate(l.taxId)),
    })),
    documentDiscount: input.documentDiscount
      ? {
          value: input.documentDiscount.value ?? 0,
          type: input.documentDiscount.type ?? "percentage",
        }
      : undefined,
    documentTax: input.documentTax
      ? { rate: docTaxRate, type: input.documentTax.type }
      : undefined,
    adjustment: input.adjustmentValue ?? 0,
  });
}

export async function createBillAction(
  input: BillInput,
  opts?: { open?: boolean }
) {
  const { user, organization } = await requireOrganization();
  const data = billSchema.parse(input);

  // Bill number duplicates are SOFT per <bills_spec>: the UI shows a
  // warning on blur (via `checkBillNumberDuplicateAction`) but the
  // user can save anyway. The DB no longer carries a unique constraint
  // (migration 20260513000000_bill_number_soft_dup dropped it). We
  // log a marker in AuditLog so duplicates are auditable.
  const dup = await db.bill.findFirst({
    where: {
      organizationId: organization.id,
      contactId: data.contactId,
      number: data.number,
      deletedAt: null,
    },
    select: { id: true, issueDate: true },
  });

  const totals = await totalsFor(organization.id, data);
  // "Save as Open" promotes the saved status from DRAFT → OPEN even
  // when the form payload says DRAFT (dual-button UX).
  const status = opts?.open ? "OPEN" : data.status;

  const created = await db.bill.create({
    data: {
      organizationId: organization.id,
      number: data.number,
      referenceNumber: data.referenceNumber ?? null,
      subject: data.subject ?? null,
      contactId: data.contactId,
      status,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      paymentTermsId: data.paymentTermsId ?? null,
      placeOfSupply: data.placeOfSupply ?? null,
      accountsPayableId: data.accountsPayableId ?? null,
      purchaseOrderId: data.purchaseOrderId ?? null,
      currency: data.currency,
      subtotal: totals.subTotal,
      discountValue: data.documentDiscount?.value ?? 0,
      discountType: data.documentDiscount?.type ?? "percentage",
      taxId: data.documentTax?.taxId ?? null,
      taxTotal: totals.documentTaxAmount,
      adjustmentLabel: data.adjustmentLabel ?? "Adjustment",
      adjustmentValue: data.adjustmentValue ?? 0,
      total: totals.total,
      notes: data.notes ?? null,
      termsAndConditions: data.termsAndConditions ?? null,
      pdfTemplateId: data.pdfTemplateId ?? null,
      attachments:
        data.attachments && data.attachments.length > 0
          ? {
              create: data.attachments.map((a) => ({
                fileName: a.fileName,
                fileUrl: a.fileUrl,
                fileSize: a.fileSize,
                mimeType: a.mimeType,
              })),
            }
          : undefined,
      lineItems: {
        create: data.lines.map((l, i) => ({
          itemId: l.itemId || null,
          position: l.position ?? i,
          name: l.name,
          description: l.description ?? "",
          hsnSacCode: l.hsnSacCode ?? null,
          accountId: l.accountId ?? null,
          billableToCustomerId: l.billableToCustomerId ?? null,
          quantity: l.quantity,
          rate: l.rate,
          taxId: l.taxId ?? null,
          amount: totals.lines[i]?.amount ?? 0,
        })),
      },
    },
  });

  // P9-A acceptance #5: when this Bill is created from a PO via
  // ?fromPO=<id>, flip the source PO's status to BILLED so the PO
  // detail page reflects that it's been billed end-to-end.
  if (data.purchaseOrderId) {
    await db.purchaseOrder.updateMany({
      where: {
        id: data.purchaseOrderId,
        organizationId: organization.id,
        deletedAt: null,
        // Don't downgrade Closed/Cancelled.
        status: { in: ["ISSUED", "PARTIALLY_BILLED"] },
      },
      data: { status: "BILLED" },
    });
  }

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Bill",
    entityId: created.id,
    after: {
      number: created.number,
      duplicateNumber: !!dup,
      total: totals.total,
      status: created.status,
    },
  });
  revalidatePath("/purchases/bills");
  redirect(`/purchases/bills/${created.id}`);
}

export async function updateBillAction(
  id: string,
  input: BillInput,
  opts?: { open?: boolean }
) {
  const { user, organization } = await requireOrganization();
  const data = billSchema.parse(input);

  const before = await db.bill.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!before) throw new Error("Bill not found");
  if (before.status === "PAID" || before.status === "WRITTEN_OFF") {
    throw new Error(
      `Cannot edit a ${before.status.toLowerCase()} bill — reverse the payment(s) or restore the bill first.`
    );
  }

  // If the user changed the bill number, re-check uniqueness against
  // the new (vendor, number) pair.
  if (data.number !== before.number || data.contactId !== before.contactId) {
    const dup = await db.bill.findFirst({
      where: {
        organizationId: organization.id,
        contactId: data.contactId,
        number: data.number,
        deletedAt: null,
        NOT: { id },
      },
      select: { id: true },
    });
    if (dup) {
      throw new Error(
        `Vendor already has a bill with number "${data.number}".`
      );
    }
  }

  const totals = await totalsFor(organization.id, data);
  const nextStatus =
    opts?.open && before.status === "DRAFT" ? "OPEN" : before.status;

  await db.$transaction(async (tx) => {
    await tx.billLineItem.deleteMany({ where: { billId: id } });
    await tx.bill.update({
      where: { id },
      data: {
        number: data.number,
        referenceNumber: data.referenceNumber ?? null,
        subject: data.subject ?? null,
        contactId: data.contactId,
        status: nextStatus,
        issueDate: data.issueDate,
        dueDate: data.dueDate,
        paymentTermsId: data.paymentTermsId ?? null,
        placeOfSupply: data.placeOfSupply ?? null,
        accountsPayableId: data.accountsPayableId ?? null,
        purchaseOrderId: data.purchaseOrderId ?? null,
        currency: data.currency,
        subtotal: totals.subTotal,
        discountValue: data.documentDiscount?.value ?? 0,
        discountType: data.documentDiscount?.type ?? "percentage",
        taxId: data.documentTax?.taxId ?? null,
        taxTotal: totals.documentTaxAmount,
        adjustmentLabel: data.adjustmentLabel ?? "Adjustment",
        adjustmentValue: data.adjustmentValue ?? 0,
        total: totals.total,
        notes: data.notes ?? null,
        termsAndConditions: data.termsAndConditions ?? null,
        pdfTemplateId: data.pdfTemplateId ?? null,
        lineItems: {
          create: data.lines.map((l, i) => ({
            itemId: l.itemId || null,
            position: l.position ?? i,
            name: l.name,
            description: l.description ?? "",
            hsnSacCode: l.hsnSacCode ?? null,
            accountId: l.accountId ?? null,
            billableToCustomerId: l.billableToCustomerId ?? null,
            quantity: l.quantity,
            rate: l.rate,
            taxId: l.taxId ?? null,
            amount: totals.lines[i]?.amount ?? 0,
          })),
        },
      },
    });
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Bill",
    entityId: id,
    before: {
      number: before.number,
      total: Number(before.total),
      status: before.status,
    },
    after: { number: data.number, total: totals.total, status: nextStatus },
  });
  revalidatePath("/purchases/bills");
  revalidatePath(`/purchases/bills/${id}`);
  redirect(`/purchases/bills/${id}`);
}

/**
 * Single-id status transitions used by the Bill detail page action
 * bar.
 *
 * State-machine guards (mirrored in tests/unit/purchases/bill-transitions):
 *  - DRAFT    → OPEN          via markOpen
 *  - OPEN     → VOID          via voidBill (any non-PAID/VOID)
 *  - any non-VOID → WRITTEN_OFF via writeOff
 *  - DRAFT    → (hard delete) via softDeleteBillAction
 *  - clone    → new DRAFT with a fresh manual number prompt
 */

export async function markBillOpenAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  const b = await db.bill.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!b) throw new Error("Bill not found");
  if (b.status !== "DRAFT") {
    throw new Error(
      `Cannot mark as Open — current status is ${b.status}.`
    );
  }
  await db.bill.update({
    where: { id },
    data: { status: "OPEN" },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Bill",
    entityId: id,
    before: { status: "DRAFT" },
    after: { status: "OPEN" },
  });
  revalidatePath("/purchases/bills");
  revalidatePath(`/purchases/bills/${id}`);
}

export async function voidBillAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  const b = await db.bill.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!b) throw new Error("Bill not found");
  if (b.status === "VOID") throw new Error("Already voided.");
  if (b.status === "PAID") {
    throw new Error(
      "Cannot void a paid bill — reverse the payment(s) first."
    );
  }
  await db.bill.update({
    where: { id },
    data: { status: "VOID", voidedAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Bill",
    entityId: id,
    before: { status: b.status },
    after: { status: "VOID" },
  });
  revalidatePath("/purchases/bills");
  revalidatePath(`/purchases/bills/${id}`);
}

export async function writeOffBillAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  const b = await db.bill.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!b) throw new Error("Bill not found");
  if (b.status === "VOID" || b.status === "WRITTEN_OFF") {
    throw new Error(
      `Cannot write off a ${b.status.toLowerCase()} bill.`
    );
  }
  if (b.status === "PAID") {
    throw new Error(
      "Cannot write off a paid bill — there's nothing left owed."
    );
  }
  await db.bill.update({
    where: { id },
    data: { status: "WRITTEN_OFF", writtenOffAt: new Date() },
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "Bill",
    entityId: id,
    before: { status: b.status },
    after: { status: "WRITTEN_OFF" },
  });
  revalidatePath("/purchases/bills");
  revalidatePath(`/purchases/bills/${id}`);
}

export async function cloneBillAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  const src = await db.bill.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
    include: { lineItems: { orderBy: { position: "asc" } } },
  });
  if (!src) throw new Error("Bill not found");

  // Append a `-copy` suffix to the bill number to keep the (vendor,
  // number) unique constraint happy. The user can edit it in /edit.
  let candidate = `${src.number}-copy`;
  for (let i = 2; i < 20; i += 1) {
    const dup = await db.bill.findFirst({
      where: {
        organizationId: organization.id,
        contactId: src.contactId,
        number: candidate,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!dup) break;
    candidate = `${src.number}-copy-${i}`;
  }

  const cloned = await db.bill.create({
    data: {
      organizationId: organization.id,
      number: candidate,
      referenceNumber: src.referenceNumber,
      subject: src.subject,
      contactId: src.contactId,
      status: "DRAFT",
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 86400000),
      paymentTermsId: src.paymentTermsId,
      placeOfSupply: src.placeOfSupply,
      accountsPayableId: src.accountsPayableId,
      currency: src.currency,
      subtotal: src.subtotal,
      discountValue: src.discountValue,
      discountType: src.discountType,
      taxId: src.taxId,
      taxTotal: src.taxTotal,
      adjustmentLabel: src.adjustmentLabel,
      adjustmentValue: src.adjustmentValue,
      total: src.total,
      notes: src.notes,
      termsAndConditions: src.termsAndConditions,
      pdfTemplateId: src.pdfTemplateId,
      lineItems: {
        create: src.lineItems.map((l, i) => ({
          itemId: l.itemId,
          position: i,
          name: l.name,
          description: l.description,
          hsnSacCode: l.hsnSacCode,
          accountId: l.accountId,
          billableToCustomerId: l.billableToCustomerId,
          quantity: l.quantity,
          rate: l.rate,
          taxId: l.taxId,
          amount: l.amount,
        })),
      },
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "Bill",
    entityId: cloned.id,
    after: {
      number: cloned.number,
      clonedFromId: src.id,
      clonedFromNumber: src.number,
    },
  });

  revalidatePath("/purchases/bills");
  redirect(`/purchases/bills/${cloned.id}/edit`);
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
