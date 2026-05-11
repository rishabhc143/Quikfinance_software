"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/next-number";
import {
  billPaymentSchema,
  vendorAdvanceSchema,
  type BillPaymentInput,
  type VendorAdvanceInput,
} from "@/lib/validations/payment-made";

export type {
  BillPaymentInput,
  VendorAdvanceInput,
} from "@/lib/validations/payment-made";

/**
 * Payments Made server actions.
 *
 * Two distinct create flows mirroring the two tabs of the form:
 *
 *   createBillPaymentAction   — paymentType=BILL_PAYMENT. Persists
 *                               the payment + N PaymentMadeAllocation
 *                               rows + flips each touched Bill's
 *                               amountPaid + status. Optionally draws
 *                               down from existing Vendor Advance rows
 *                               via allocation.source='ADVANCE'.
 *
 *   createVendorAdvanceAction — paymentType=VENDOR_ADVANCE. Persists
 *                               the payment alone; no allocations. The
 *                               row's `amount - sum(applications)` is
 *                               the available advance balance for
 *                               future Bill Payments to draw down.
 *
 * Plus a small handful of query helpers the form needs at runtime:
 *  - getOpenBillsForVendorAction
 *  - getVendorAdvanceBalanceAction
 *
 * The legacy createPaymentMadeAction signature is retained as a
 * forwarding shim so the existing form (if still rendered anywhere)
 * keeps working until the rewrite lands.
 */

// ───── Query helpers ──────────────────────────────────────────────

export async function getOpenBillsForVendorAction(input: {
  vendorId: string;
}): Promise<
  Array<{
    id: string;
    number: string;
    total: number;
    amountPaid: number;
    amountDue: number;
    dueDate: Date;
    issueDate: Date;
    purchaseOrderNumber: string | null;
  }>
> {
  const { organization } = await requireOrganization();
  if (!input.vendorId) return [];
  const bills = await db.bill.findMany({
    where: {
      organizationId: organization.id,
      contactId: input.vendorId,
      deletedAt: null,
      status: { in: ["OPEN", "PARTIALLY_PAID", "OVERDUE"] },
    },
    orderBy: { dueDate: "asc" },
    include: {
      purchaseOrder: { select: { number: true } },
    },
  });
  return bills.map((b) => ({
    id: b.id,
    number: b.number,
    total: Number(b.total),
    amountPaid: Number(b.amountPaid),
    amountDue: Number(b.total) - Number(b.amountPaid),
    dueDate: b.dueDate,
    issueDate: b.issueDate,
    purchaseOrderNumber: b.purchaseOrder?.number ?? null,
  }));
}

/**
 * Compute the vendor's available Vendor Advance balance. Sum of all
 * VENDOR_ADVANCE PaymentMade.amount minus sum of PaymentMadeAllocation
 * rows pointing at those advance payments.
 *
 * Returns per-advance-row breakdown so the Bill Payment UI can list
 * each advance separately (rare but supports multiple advances).
 */
export async function getVendorAdvanceBalanceAction(input: {
  vendorId: string;
}): Promise<{
  totalBalance: number;
  advances: Array<{
    paymentMadeId: string;
    number: string;
    paymentDate: Date;
    originalAmount: number;
    used: number;
    remaining: number;
  }>;
}> {
  const { organization } = await requireOrganization();
  if (!input.vendorId) return { totalBalance: 0, advances: [] };
  const advances = await db.paymentMade.findMany({
    where: {
      organizationId: organization.id,
      contactId: input.vendorId,
      paymentType: "VENDOR_ADVANCE",
      deletedAt: null,
      // Don't surface Draft advances — only completed (status=PAID)
      // money sitting in Prepaid Expenses is available to draw.
      status: "PAID",
    },
    include: { allocations: { select: { amount: true } } },
    orderBy: { paymentDate: "asc" },
  });
  const rows = advances.map((a) => {
    const used = a.allocations.reduce((s, x) => s + Number(x.amount), 0);
    const original = Number(a.amount);
    return {
      paymentMadeId: a.id,
      number: a.number,
      paymentDate: a.paymentDate,
      originalAmount: original,
      used,
      remaining: Math.max(0, original - used),
    };
  });
  const totalBalance = rows.reduce((s, r) => s + r.remaining, 0);
  return { totalBalance, advances: rows.filter((r) => r.remaining > 0.001) };
}

// ───── Create: Bill Payment ───────────────────────────────────────

export async function createBillPaymentAction(input: BillPaymentInput) {
  const { user, organization } = await requireOrganization();
  const data = billPaymentSchema.parse(input);

  const number = await nextDocumentNumber(organization.id, "paymentMade");

  // Validate every allocation: bill belongs to vendor + amount fits
  // outstanding balance. Source='ADVANCE' rows additionally need to
  // verify the advance has remaining balance.
  const billIds = Array.from(new Set(data.allocations.map((a) => a.billId)));
  const advanceIds = Array.from(
    new Set(
      data.allocations
        .filter((a) => a.source === "ADVANCE" && a.sourcePaymentMadeId)
        .map((a) => a.sourcePaymentMadeId!) as string[]
    )
  );

  const created = await db.$transaction(async (tx) => {
    const bills = await tx.bill.findMany({
      where: {
        id: { in: billIds },
        organizationId: organization.id,
        contactId: data.contactId,
        deletedAt: null,
      },
    });
    if (bills.length !== billIds.length) {
      throw new Error(
        "Some bills not found or don't belong to this vendor"
      );
    }

    // Pre-flight: each bill's total allocations can't exceed its
    // outstanding balance.
    const allocsByBill = new Map<string, number>();
    for (const a of data.allocations) {
      allocsByBill.set(
        a.billId,
        (allocsByBill.get(a.billId) ?? 0) + a.amount
      );
    }
    for (const b of bills) {
      const outstanding = Number(b.total) - Number(b.amountPaid);
      const want = allocsByBill.get(b.id) ?? 0;
      if (want > outstanding + 0.001) {
        throw new Error(
          `Cannot allocate ${want.toFixed(2)} to ${
            b.number
          } — only ${outstanding.toFixed(2)} outstanding.`
        );
      }
    }

    // Pre-flight: each advance source has enough remaining balance.
    if (advanceIds.length > 0) {
      const advances = await tx.paymentMade.findMany({
        where: {
          id: { in: advanceIds },
          organizationId: organization.id,
          paymentType: "VENDOR_ADVANCE",
          contactId: data.contactId,
          deletedAt: null,
        },
        include: { allocations: { select: { amount: true } } },
      });
      if (advances.length !== advanceIds.length) {
        throw new Error("Vendor advance not found");
      }
      const drawByAdvance = new Map<string, number>();
      for (const a of data.allocations) {
        if (a.source === "ADVANCE" && a.sourcePaymentMadeId) {
          drawByAdvance.set(
            a.sourcePaymentMadeId,
            (drawByAdvance.get(a.sourcePaymentMadeId) ?? 0) + a.amount
          );
        }
      }
      for (const adv of advances) {
        const used = adv.allocations.reduce(
          (s, x) => s + Number(x.amount),
          0
        );
        const remaining = Number(adv.amount) - used;
        const want = drawByAdvance.get(adv.id) ?? 0;
        if (want > remaining + 0.001) {
          throw new Error(
            `Vendor advance ${adv.number} only has ${remaining.toFixed(
              2
            )} remaining — can't draw ${want.toFixed(2)}.`
          );
        }
      }
    }

    // The cash portion of this payment = amountPaid minus the sum of
    // advance-sourced allocations. Excess (amountPaid greater than the
    // sum of fresh+advance allocations) becomes a paired VENDOR_ADVANCE
    // row — see below.
    const advanceSum = data.allocations
      .filter((a) => a.source === "ADVANCE")
      .reduce((s, a) => s + a.amount, 0);
    const freshSum = data.allocations
      .filter((a) => a.source === "FRESH")
      .reduce((s, a) => s + a.amount, 0);
    const excess = Math.max(0, data.amountPaid - freshSum - advanceSum);

    // Create the BILL_PAYMENT row. Cash portion = amountPaid - advanceSum.
    // amountUsedForBills = freshSum + advanceSum. amountInExcess records
    // the leftover; the paired advance row gets the actual money.
    const payment = await tx.paymentMade.create({
      data: {
        organizationId: organization.id,
        number,
        contactId: data.contactId,
        paymentType: "BILL_PAYMENT",
        paymentDate: data.paymentDate,
        amount: data.amountPaid,
        amountUsedForBills: freshSum + advanceSum,
        amountInExcess: excess,
        paymentMode: data.paymentMode,
        method: data.paymentMode, // legacy column kept in sync
        paidThroughAccountId: data.paidThroughAccountId ?? null,
        reference: data.reference ?? null,
        notes: data.notes ?? null,
        status: data.status,
      },
    });

    // Fresh allocations point at the new BILL_PAYMENT row.
    for (const a of data.allocations.filter((x) => x.source === "FRESH")) {
      await tx.paymentMadeAllocation.create({
        data: {
          paymentMadeId: payment.id,
          billId: a.billId,
          amount: a.amount,
        },
      });
    }
    // Advance drawdown allocations point at the ORIGINAL advance row
    // so its balance decreases. The new BILL_PAYMENT row doesn't get
    // an allocation for those amounts — its `amountUsedForBills`
    // already accounts for them; the BillPaymentApplication ledger
    // attributes the funds to the advance source.
    for (const a of data.allocations.filter((x) => x.source === "ADVANCE")) {
      if (!a.sourcePaymentMadeId) continue;
      await tx.paymentMadeAllocation.create({
        data: {
          paymentMadeId: a.sourcePaymentMadeId,
          billId: a.billId,
          amount: a.amount,
        },
      });
    }

    // Update each touched Bill's amountPaid + status.
    for (const billId of billIds) {
      const before = bills.find((b) => b.id === billId)!;
      const allocTotal = allocsByBill.get(billId) ?? 0;
      const newPaid = Number(before.amountPaid) + allocTotal;
      const total = Number(before.total);
      const status =
        newPaid >= total - 0.001
          ? "PAID"
          : newPaid > 0.001
          ? "PARTIALLY_PAID"
          : "OPEN";
      await tx.bill.update({
        where: { id: billId },
        data: { amountPaid: newPaid, status },
      });
    }

    // Excess → spawn a paired VENDOR_ADVANCE row for the excess amount.
    // The accounting story: cash leaves the bank, the part that
    // matches bill totals settles AP, the rest sits in Prepaid
    // Expenses as a fresh advance.
    if (excess > 0.001) {
      const advanceNumber = await nextDocumentNumber(
        organization.id,
        "paymentMade"
      );
      await tx.paymentMade.create({
        data: {
          organizationId: organization.id,
          number: advanceNumber,
          contactId: data.contactId,
          paymentType: "VENDOR_ADVANCE",
          paymentDate: data.paymentDate,
          amount: excess,
          amountUsedForBills: 0,
          amountInExcess: 0,
          paymentMode: data.paymentMode,
          method: data.paymentMode,
          paidThroughAccountId: data.paidThroughAccountId ?? null,
          reference: data.reference ?? null,
          notes: `Auto-spawned from excess on ${payment.number}`,
          status: data.status,
        },
      });
    }

    return payment;
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "PaymentMade",
    entityId: created.id,
    after: {
      number: created.number,
      paymentType: "BILL_PAYMENT",
      amount: data.amountPaid,
      bills: data.allocations.length,
    },
  });

  revalidatePath("/purchases/payments-made");
  revalidatePath("/purchases/bills");
  redirect(`/purchases/payments-made/${created.id}`);
}

// ───── Create: Vendor Advance ─────────────────────────────────────

export async function createVendorAdvanceAction(input: VendorAdvanceInput) {
  const { user, organization } = await requireOrganization();
  const data = vendorAdvanceSchema.parse(input);
  const number = await nextDocumentNumber(organization.id, "paymentMade");

  const created = await db.paymentMade.create({
    data: {
      organizationId: organization.id,
      number,
      contactId: data.contactId,
      paymentType: "VENDOR_ADVANCE",
      paymentDate: data.paymentDate,
      amount: data.amountPaid,
      amountUsedForBills: 0,
      amountInExcess: 0,
      tdsId: data.tdsId ?? null,
      tdsAmount: data.tdsAmount ?? null,
      paymentMode: data.paymentMode,
      method: data.paymentMode,
      paidThroughAccountId: data.paidThroughAccountId ?? null,
      depositToAccountId: data.depositToAccountId ?? null,
      reference: data.reference ?? null,
      notes: data.notes ?? null,
      status: data.status,
    },
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "PaymentMade",
    entityId: created.id,
    after: {
      number: created.number,
      paymentType: "VENDOR_ADVANCE",
      amount: data.amountPaid,
    },
  });

  revalidatePath("/purchases/payments-made");
  redirect(`/purchases/payments-made/${created.id}`);
}

// ───── Legacy + delete + bulk ─────────────────────────────────────

/**
 * Legacy shim — kept so any in-flight callers don't break. New code
 * should call createBillPaymentAction or createVendorAdvanceAction
 * directly with the discriminated payload.
 */
export type PaymentMadeInput = {
  contactId: string;
  paymentDate: Date;
  method?: string | null;
  reference?: string | null;
  bankAccountId?: string | null;
  notes?: string | null;
  allocations: { billId: string; amount: number }[];
};

export async function createPaymentMadeAction(input: PaymentMadeInput) {
  const totalAmount = input.allocations.reduce((s, a) => s + a.amount, 0);
  return createBillPaymentAction({
    paymentType: "BILL_PAYMENT",
    contactId: input.contactId,
    paymentDate: input.paymentDate,
    amountPaid: totalAmount,
    paymentMode: "cash",
    paidThroughAccountId: input.bankAccountId ?? null,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
    allocations: input.allocations.map((a) => ({
      billId: a.billId,
      amount: a.amount,
      source: "FRESH",
    })),
    status: "PAID",
  });
}

export async function deletePaymentMadeAction(id: string) {
  const { user, organization } = await requireOrganization();
  const payment = await db.paymentMade.findFirst({
    where: { id, organizationId: organization.id },
    include: { allocations: true },
  });
  if (!payment) return { ok: false };
  await db.$transaction(async (tx) => {
    for (const alloc of payment.allocations) {
      const b = await tx.bill.findUniqueOrThrow({ where: { id: alloc.billId } });
      const newPaid = Math.max(0, Number(b.amountPaid) - Number(alloc.amount));
      const total = Number(b.total);
      const status =
        newPaid <= 0.001
          ? "OPEN"
          : newPaid >= total - 0.001
          ? "PAID"
          : "PARTIALLY_PAID";
      await tx.bill.update({ where: { id: b.id }, data: { amountPaid: newPaid, status } });
    }
    await tx.paymentMadeAllocation.deleteMany({
      where: { paymentMadeId: id },
    });
    await tx.paymentMade.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "PaymentMade",
    entityId: id,
    before: { number: payment.number },
  });
  revalidatePath("/purchases/payments-made");
  revalidatePath("/purchases/bills");
  return { ok: true };
}

/**
 * Bulk delete payments — reverses bill balances safely. Same shape
 * as the single-delete but for an array of ids. Used by the list-page
 * BulkAwareDataTable.
 */
export async function bulkDeletePaymentsMadeAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const payments = await db.paymentMade.findMany({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      deletedAt: null,
    },
    include: { allocations: true },
  });
  if (payments.length === 0) return { ok: true, updated: 0 };
  let updatedCount = 0;
  await db.$transaction(async (tx) => {
    for (const p of payments) {
      for (const a of p.allocations) {
        const b = await tx.bill.findUnique({ where: { id: a.billId } });
        if (!b) continue;
        const newPaid = Math.max(
          0,
          Number(b.amountPaid) - Number(a.amount)
        );
        const total = Number(b.total);
        const status =
          newPaid <= 0.001
            ? "OPEN"
            : newPaid >= total - 0.001
            ? "PAID"
            : "PARTIALLY_PAID";
        await tx.bill.update({
          where: { id: b.id },
          data: { amountPaid: newPaid, status },
        });
      }
      await tx.paymentMadeAllocation.deleteMany({
        where: { paymentMadeId: p.id },
      });
      await tx.paymentMade.update({
        where: { id: p.id },
        data: { deletedAt: new Date() },
      });
      updatedCount += 1;
    }
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "PaymentMade",
    entityId: `bulk-delete-${Date.now()}`,
    before: { count: updatedCount, ids: input.ids },
  });
  revalidatePath("/purchases/payments-made");
  revalidatePath("/purchases/bills");
  return { ok: true, updated: updatedCount };
}
