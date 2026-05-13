"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { getNextDocumentNumber } from "@/lib/sales/numbering";
import { computeDocument } from "@/lib/sales/totals";
import {
  vendorCreditSchema,
  applyVendorCreditToBillSchema,
  recordVendorCreditRefundSchema,
  type VendorCreditInput,
  type ApplyVendorCreditInput,
  type RecordVendorCreditRefundInput,
} from "@/lib/validations/vendor-credit";
import {
  postVendorCreditOpenJe,
  postVendorCreditRefundJe,
  reverseVendorCreditJes,
  resolveBankCoaForPayment,
} from "@/lib/accounting/post-domain-je";

export type {
  VendorCreditInput,
  ApplyVendorCreditInput,
  RecordVendorCreditRefundInput,
};

/**
 * Vendor Credit server actions per <vendor_credits_spec>.
 *
 * Lifecycle: DRAFT → OPEN → CLOSED (when applied + refunded fully)
 *                          ↘ VOID
 *
 * Number prefix is CN- per spec (auto-gen via VENDOR_CREDIT doc type).
 * Totals math via the shared computeDocument primitive.
 */

async function totalsFor(orgId: string, input: VendorCreditInput) {
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
    adjustment: 0,
  });
}

// ───── Create / Update ────────────────────────────────────────────

export async function createVendorCreditAction(
  input: VendorCreditInput,
  opts?: { open?: boolean }
) {
  const { user, organization } = await requireOrganization();
  const data = vendorCreditSchema.parse(input);
  const number = await getNextDocumentNumber(
    organization.id,
    "VENDOR_CREDIT"
  );
  const totals = await totalsFor(organization.id, data);
  const status = opts?.open ? "OPEN" : data.status;

  // RPT-B.2 — wrap the create + (optional OPEN-state JE post) so either
  // both land or both roll back.
  const created = await db.$transaction(async (tx) => {
    const vc = await tx.vendorCredit.create({
      data: {
        organizationId: organization.id,
        number,
        referenceNumber: data.referenceNumber ?? null,
        contactId: data.contactId,
        date: data.date,
        subject: data.subject ?? null,
        status,
        currency: data.currency,
        subTotal: totals.subTotal,
        taxAmount: totals.documentTaxAmount,
        total: totals.total,
        placeOfSupply: data.placeOfSupply ?? null,
        reason: data.reason ?? null,
        notes: data.notes ?? null,
        pdfTemplateId: data.pdfTemplateId ?? null,
        lineItems: {
          create: data.lines.map((l, i) => ({
            itemId: l.itemId || null,
            position: l.position ?? i,
            name: l.name,
            description: l.description ?? null,
            hsnSacCode: l.hsnSacCode ?? null,
            accountId: l.accountId ?? null,
            quantity: l.quantity,
            rate: l.rate,
            taxId: l.taxId ?? null,
            amount: totals.lines[i]?.amount ?? 0,
          })),
        },
      },
    });
    if (status === "OPEN") {
      await postVendorCreditOpenJe(tx, organization.id, vc);
    }
    return vc;
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "VendorCredit",
    entityId: created.id,
    after: {
      number: created.number,
      total: totals.total,
      status: created.status,
    },
  });

  revalidatePath("/purchases/vendor-credits");
  redirect(`/purchases/vendor-credits/${created.id}`);
}

export async function updateVendorCreditAction(
  id: string,
  input: VendorCreditInput,
  opts?: { open?: boolean }
) {
  const { user, organization } = await requireOrganization();
  const data = vendorCreditSchema.parse(input);
  const before = await db.vendorCredit.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!before) throw new Error("Vendor credit not found");
  if (before.status === "CLOSED" || before.status === "VOID") {
    throw new Error(
      `Cannot edit a ${before.status.toLowerCase()} vendor credit.`
    );
  }
  // Block edits once any amount has been applied or refunded —
  // changing the credit total would orphan the application math.
  if (
    Number(before.amountApplied) > 0 ||
    Number(before.amountRefunded) > 0
  ) {
    throw new Error(
      "Cannot edit a vendor credit that has applications or refunds. Reverse them first."
    );
  }
  const totals = await totalsFor(organization.id, data);
  const nextStatus =
    opts?.open && before.status === "DRAFT" ? "OPEN" : before.status;

  await db.$transaction(async (tx) => {
    await tx.vendorCreditLineItem.deleteMany({
      where: { vendorCreditId: id },
    });
    await tx.vendorCredit.update({
      where: { id },
      data: {
        referenceNumber: data.referenceNumber ?? null,
        contactId: data.contactId,
        date: data.date,
        subject: data.subject ?? null,
        status: nextStatus,
        currency: data.currency,
        subTotal: totals.subTotal,
        taxAmount: totals.documentTaxAmount,
        total: totals.total,
        placeOfSupply: data.placeOfSupply ?? null,
        reason: data.reason ?? null,
        notes: data.notes ?? null,
        pdfTemplateId: data.pdfTemplateId ?? null,
        lineItems: {
          create: data.lines.map((l, i) => ({
            itemId: l.itemId || null,
            position: l.position ?? i,
            name: l.name,
            description: l.description ?? null,
            hsnSacCode: l.hsnSacCode ?? null,
            accountId: l.accountId ?? null,
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
    entityType: "VendorCredit",
    entityId: id,
    before: {
      number: before.number,
      total: Number(before.total),
      status: before.status,
    },
    after: { total: totals.total, status: nextStatus },
  });
  revalidatePath("/purchases/vendor-credits");
  revalidatePath(`/purchases/vendor-credits/${id}`);
  redirect(`/purchases/vendor-credits/${id}`);
}

// ───── Status transitions ─────────────────────────────────────────

export async function markVendorCreditOpenAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  const c = await db.vendorCredit.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
  });
  if (!c) throw new Error("Vendor credit not found");
  if (c.status !== "DRAFT") {
    throw new Error(
      `Cannot mark as Open — current status is ${c.status}.`
    );
  }
  // RPT-B.2 — flip + post atomically.
  await db.$transaction(async (tx) => {
    const updated = await tx.vendorCredit.update({
      where: { id },
      data: { status: "OPEN" },
      select: { id: true, number: true, date: true, total: true },
    });
    await postVendorCreditOpenJe(tx, organization.id, updated);
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "VendorCredit",
    entityId: id,
    before: { status: "DRAFT" },
    after: { status: "OPEN" },
  });
  revalidatePath("/purchases/vendor-credits");
  revalidatePath(`/purchases/vendor-credits/${id}`);
}

export async function voidVendorCreditAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  const c = await db.vendorCredit.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
    select: {
      id: true,
      status: true,
      amountApplied: true,
      amountRefunded: true,
    },
  });
  if (!c) throw new Error("Vendor credit not found");
  if (c.status === "VOID") throw new Error("Already voided.");
  if (Number(c.amountApplied) > 0 || Number(c.amountRefunded) > 0) {
    throw new Error(
      "Cannot void a credit that has applications or refunds. Reverse them first."
    );
  }
  // RPT-B.2 — void + reverse the OPEN JE (if any).
  await db.$transaction(async (tx) => {
    await tx.vendorCredit.update({
      where: { id },
      data: { status: "VOID" },
    });
    await reverseVendorCreditJes(tx, organization.id, id);
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "VendorCredit",
    entityId: id,
    before: { status: c.status },
    after: { status: "VOID" },
  });
  revalidatePath("/purchases/vendor-credits");
  revalidatePath(`/purchases/vendor-credits/${id}`);
}

// ───── Apply to Bill ──────────────────────────────────────────────

/**
 * Load the vendor's open bills that this credit can be applied to.
 * Returns OPEN/PARTIALLY_PAID/OVERDUE bills only — Paid bills can't
 * accept further applications.
 */
export async function getOpenBillsForVendorCreditAction(input: {
  vendorCreditId: string;
}): Promise<
  Array<{
    id: string;
    number: string;
    issueDate: Date;
    dueDate: Date;
    total: number;
    amountPaid: number;
    amountDue: number;
  }>
> {
  const { organization } = await requireOrganization();
  const vc = await db.vendorCredit.findFirst({
    where: {
      id: input.vendorCreditId,
      organizationId: organization.id,
      deletedAt: null,
    },
    select: { contactId: true },
  });
  if (!vc) return [];
  const bills = await db.bill.findMany({
    where: {
      organizationId: organization.id,
      contactId: vc.contactId,
      deletedAt: null,
      status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
    },
    orderBy: { dueDate: "asc" },
    select: {
      id: true,
      number: true,
      issueDate: true,
      dueDate: true,
      total: true,
      amountPaid: true,
    },
  });
  return bills.map((b) => ({
    id: b.id,
    number: b.number,
    issueDate: b.issueDate,
    dueDate: b.dueDate,
    total: Number(b.total),
    amountPaid: Number(b.amountPaid),
    amountDue: Number(b.total) - Number(b.amountPaid),
  }));
}

export async function applyVendorCreditToBillAction(
  input: ApplyVendorCreditInput
): Promise<void> {
  const { user, organization } = await requireOrganization();
  const data = applyVendorCreditToBillSchema.parse(input);

  await db.$transaction(async (tx) => {
    const vc = await tx.vendorCredit.findFirst({
      where: {
        id: data.vendorCreditId,
        organizationId: organization.id,
        deletedAt: null,
      },
    });
    if (!vc) throw new Error("Vendor credit not found");
    if (vc.status !== "OPEN" && vc.status !== "CLOSED") {
      throw new Error(
        `Cannot apply a ${vc.status.toLowerCase()} credit. Mark as Open first.`
      );
    }
    const total = Number(vc.total);
    const used = Number(vc.amountApplied) + Number(vc.amountRefunded);
    const remaining = total - used;
    const wantSum = data.applications.reduce((s, a) => s + a.amount, 0);
    if (wantSum > remaining + 0.001) {
      throw new Error(
        `Credit has only ${remaining.toFixed(2)} remaining; can't apply ${wantSum.toFixed(2)}.`
      );
    }

    // Verify each bill: belongs to vendor, has outstanding balance.
    const bills = await tx.bill.findMany({
      where: {
        id: { in: data.applications.map((a) => a.billId) },
        organizationId: organization.id,
        contactId: vc.contactId,
        deletedAt: null,
      },
    });
    if (bills.length !== new Set(data.applications.map((a) => a.billId)).size) {
      throw new Error("Some bills not found or don't belong to this vendor");
    }
    for (const app of data.applications) {
      const b = bills.find((x) => x.id === app.billId)!;
      const outstanding = Number(b.total) - Number(b.amountPaid);
      if (app.amount > outstanding + 0.001) {
        throw new Error(
          `Bill ${b.number} only has ${outstanding.toFixed(2)} outstanding.`
        );
      }
    }

    // Persist application rows + flip credit/bill balances.
    for (const app of data.applications) {
      await tx.vendorCreditApplication.create({
        data: {
          vendorCreditId: vc.id,
          billId: app.billId,
          amountApplied: app.amount,
          appliedAt: data.appliedDate,
        },
      });
      const b = bills.find((x) => x.id === app.billId)!;
      const newPaid = Number(b.amountPaid) + app.amount;
      const billTotal = Number(b.total);
      const newStatus =
        newPaid >= billTotal - 0.001
          ? "PAID"
          : newPaid > 0.001
          ? "PARTIALLY_PAID"
          : "OPEN";
      await tx.bill.update({
        where: { id: b.id },
        data: { amountPaid: newPaid, status: newStatus },
      });
    }

    const newApplied = Number(vc.amountApplied) + wantSum;
    const newRemaining = total - newApplied - Number(vc.amountRefunded);
    const nextStatus =
      newRemaining <= 0.001 ? "CLOSED" : vc.status;

    await tx.vendorCredit.update({
      where: { id: vc.id },
      data: { amountApplied: newApplied, status: nextStatus },
    });
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "VendorCredit",
    entityId: data.vendorCreditId,
    after: { applications: data.applications.length },
  });

  revalidatePath("/purchases/vendor-credits");
  revalidatePath(`/purchases/vendor-credits/${data.vendorCreditId}`);
  revalidatePath("/purchases/bills");
}

// ───── Record Refund ──────────────────────────────────────────────

export async function recordVendorCreditRefundAction(
  input: RecordVendorCreditRefundInput
): Promise<void> {
  const { user, organization } = await requireOrganization();
  const data = recordVendorCreditRefundSchema.parse(input);

  await db.$transaction(async (tx) => {
    const vc = await tx.vendorCredit.findFirst({
      where: {
        id: data.vendorCreditId,
        organizationId: organization.id,
        deletedAt: null,
      },
    });
    if (!vc) throw new Error("Vendor credit not found");
    if (vc.status !== "OPEN" && vc.status !== "CLOSED") {
      throw new Error(
        `Cannot refund a ${vc.status.toLowerCase()} credit.`
      );
    }
    const total = Number(vc.total);
    const used = Number(vc.amountApplied) + Number(vc.amountRefunded);
    const remaining = total - used;
    if (data.amount > remaining + 0.001) {
      throw new Error(
        `Credit has only ${remaining.toFixed(2)} remaining; can't refund ${data.amount.toFixed(2)}.`
      );
    }

    const refund = await tx.vendorCreditRefund.create({
      data: {
        vendorCreditId: vc.id,
        amount: data.amount,
        refundDate: data.refundDate,
        paymentMode: data.paymentMode,
        fromAccountId: data.fromAccountId ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
      },
    });

    const newRefunded = Number(vc.amountRefunded) + data.amount;
    const newRemaining = total - Number(vc.amountApplied) - newRefunded;
    const nextStatus = newRemaining <= 0.001 ? "CLOSED" : vc.status;
    await tx.vendorCredit.update({
      where: { id: vc.id },
      data: { amountRefunded: newRefunded, status: nextStatus },
    });

    // RPT-B.3 — DR Bank / CR AP for the refund. Counterbalances the
    // VC-OPEN entry's AP offset for this slice.
    const bankCoaId = await resolveBankCoaForPayment(tx, organization.id, {
      paidThroughAccountId: data.fromAccountId,
    });
    await postVendorCreditRefundJe(
      tx,
      organization.id,
      vc.id,
      refund.id,
      vc.number,
      data.amount,
      data.refundDate,
      bankCoaId
    );
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "UPDATE",
    entityType: "VendorCredit",
    entityId: data.vendorCreditId,
    after: { refundAmount: data.amount },
  });

  revalidatePath("/purchases/vendor-credits");
  revalidatePath(`/purchases/vendor-credits/${data.vendorCreditId}`);
}

// ───── Delete + bulk (kept from earlier) ─────────────────────────

export async function bulkDeleteVendorCreditsAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };

  const blocked = await db.vendorCredit.count({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
      OR: [
        { amountApplied: { gt: 0 } },
        { amountRefunded: { gt: 0 } },
      ],
    },
  });
  if (blocked > 0) {
    return {
      ok: false,
      error: `${blocked} credit${
        blocked === 1 ? "" : "s"
      } already applied or refunded. Reverse those first.`,
    };
  }

  const result = await db.vendorCredit.updateMany({
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
    entityType: "VendorCredit",
    entityId: `bulk-delete-${Date.now()}`,
    before: { count: result.count, ids: input.ids },
  });
  revalidatePath("/purchases/vendor-credits");
  return { ok: true, updated: result.count };
}

export async function deleteVendorCreditAction(id: string) {
  const { user, organization } = await requireOrganization();
  const vc = await db.vendorCredit.findFirst({
    where: { id, organizationId: organization.id },
    select: {
      id: true,
      number: true,
      amountApplied: true,
      amountRefunded: true,
    },
  });
  if (!vc) return { ok: false };
  if (
    Number(vc.amountApplied) > 0 ||
    Number(vc.amountRefunded) > 0
  ) {
    return {
      ok: false,
      error: "Already applied or refunded — reverse those first.",
    };
  }
  await db.$transaction(async (tx) => {
    await tx.vendorCredit.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    // RPT-B.2 — pull the VC-OPEN JE if one was posted (DRAFT-only credits have none).
    await reverseVendorCreditJes(tx, organization.id, id);
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "VendorCredit",
    entityId: id,
    before: { number: vc.number },
  });
  revalidatePath("/purchases/vendor-credits");
  return { ok: true };
}
