"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { recordPaymentAction } from "../invoices/actions";
import { enqueueEmail } from "@/lib/sales/email-sender";
import { decryptSecret } from "@/lib/crypto";
import { createRazorpayRefund } from "@/lib/sales/razorpay";
import {
  computeRefundRatio,
  computeProportionalAllocationReversal,
} from "@/lib/sales/refund-math";
import type { RecordPaymentInput } from "@/lib/validations/invoice";
import { reversePaymentReceivedJes } from "@/lib/accounting/post-domain-je";
import { format } from "date-fns";

/**
 * Record a payment from the Payments Received page (vs from inside an
 * invoice). Server logic is shared with invoices/actions.recordPaymentAction.
 */
export async function recordStandalonePaymentAction(input: RecordPaymentInput) {
  await recordPaymentAction(input);
}

/**
 * Refund a Payment Received. Creates a reversal payment row with negative
 * amount and unwinds any allocations (decrementing each invoice's
 * amountPaid + flipping status back). Per <payments_received_spec> the
 * reversal is itself a PaymentReceived row so it's visible in the list.
 */
export async function refundPaymentAction(
  id: string,
  input: {
    refundDate: Date | string;
    reference?: string | null;
    notes?: string | null;
    /**
     * M33: optional partial-refund amount. When omitted or equal to
     * the original amount, behaves as a full refund (existing M30
     * path). When set to a value < original.amount, refunds only that
     * portion: Razorpay API is called with the partial amount,
     * invoice allocations are reversed proportionally, and the
     * original PaymentReceived row is left intact (not soft-deleted)
     * so further partials can chip away at the remaining balance.
     */
    amount?: number | null;
  }
): Promise<void> {
  const { user, organization } = await requireOrganization();
  const original = await db.paymentReceived.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
    include: { allocations: { include: { invoice: true } } },
  });
  if (!original) throw new Error("Payment not found");

  const refundDate =
    input.refundDate instanceof Date
      ? input.refundDate
      : new Date(input.refundDate);

  // M33: figure out partial vs full refund.
  const originalAmount = Number(original.amount);
  // Sum prior partial refunds (negative-amount sibling rows whose
  // number matches `<original>-R` or `<original>-R<n>`) so we know
  // how much is still refundable.
  const priorRefundRows = await db.paymentReceived.findMany({
    where: {
      organizationId: organization.id,
      contactId: original.contactId,
      number: { startsWith: `${original.number}-R` },
    },
    select: { amount: true },
  });
  const alreadyRefunded = priorRefundRows.reduce(
    (s, r) => s + Math.abs(Number(r.amount)),
    0
  );
  const remaining = originalAmount - alreadyRefunded;
  if (remaining <= 0.0001) {
    throw new Error("This payment has already been fully refunded");
  }

  const requestedAmount =
    input.amount !== null && input.amount !== undefined
      ? Number(input.amount)
      : remaining;
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) {
    throw new Error("Refund amount must be greater than zero");
  }
  if (requestedAmount > remaining + 0.0001) {
    throw new Error(
      `Refund amount ${requestedAmount} exceeds the remaining ${remaining}`
    );
  }
  const isPartial = requestedAmount < remaining - 0.0001;

  // Suffix subsequent reversal rows with -R, -R2, -R3 so we never
  // collide on @@unique([organizationId, number]).
  const refundNumber = (() => {
    const seq = priorRefundRows.length;
    return seq === 0
      ? `${original.number}-R`
      : `${original.number}-R${seq + 1}`;
  })();

  // M30: Razorpay-sourced payments — call Razorpay's /refund API first
  // so the merchant's Razorpay account actually moves the money. The
  // M22 webhook (refund.processed) will fire shortly after; its
  // idempotency check on attempt.status="REFUNDED" makes it a no-op
  // for full refunds. For M33 partial refunds, the attempt status
  // stays at CAPTURED so subsequent partials can call the API again.
  let razorpayRefundId: string | null = null;
  if (original.paymentMode === "razorpay") {
    const attempt = await db.razorpayPaymentAttempt.findFirst({
      where: {
        organizationId: organization.id,
        paymentReceivedId: original.id,
        razorpayPaymentId: { not: null },
      },
    });
    if (!attempt?.razorpayPaymentId) {
      throw new Error(
        "Razorpay payment id not found on this payment — cannot refund"
      );
    }
    if (attempt.status === "REFUNDED") {
      throw new Error("This Razorpay payment has already been refunded");
    }
    const cfg = await db.paymentGatewayConfig.findUnique({
      where: { organizationId: organization.id },
    });
    if (
      !cfg ||
      !cfg.razorpayKeyId ||
      !cfg.razorpayKeySecretEncrypted
    ) {
      throw new Error("Razorpay is not configured for this organization");
    }
    let keySecret: string;
    try {
      keySecret = decryptSecret(cfg.razorpayKeySecretEncrypted);
    } catch {
      throw new Error("Failed to decrypt Razorpay credentials");
    }
    const r = await createRazorpayRefund({
      keyId: cfg.razorpayKeyId,
      keySecret,
      paymentId: attempt.razorpayPaymentId,
      amountPaise: Math.round(requestedAmount * 100),
      notes: {
        reason: input.reference ?? input.notes ?? "Merchant-initiated refund",
        paymentReceivedId: original.id,
        partial: isPartial ? "true" : "false",
      },
    });
    if (!r.ok) {
      throw new Error(r.error ?? "Razorpay refund failed");
    }
    razorpayRefundId = r.refundId ?? null;
    // For full refunds, mark attempt REFUNDED so the M22 webhook is
    // idempotent. For partials, leave status=CAPTURED so further
    // partials can run.
    if (!isPartial) {
      await db.razorpayPaymentAttempt.update({
        where: { id: attempt.id },
        data: { status: "REFUNDED" },
      });
    }
  }

  // Pure-math step: ratio + per-allocation rollback are computed
  // upfront so they can be unit-tested in isolation.
  const ratio = computeRefundRatio({ requestedAmount, originalAmount });
  const reversals = computeProportionalAllocationReversal(
    original.allocations.map((a) => ({
      invoiceId: a.invoice.id,
      amount: Number(a.amount),
      invoiceAmountPaid: Number(a.invoice.amountPaid),
      invoiceTotal: Number(a.invoice.total),
      invoiceDueDate: a.invoice.dueDate,
    })),
    ratio
  );

  await db.$transaction(async (tx) => {
    // Reversal row — negative amount = the refund portion. For a
    // partial, amountUsedForInvoices/amountInExcess are scaled down
    // proportionally to the same ratio.
    await tx.paymentReceived.create({
      data: {
        organizationId: organization.id,
        number: refundNumber,
        contactId: original.contactId,
        paymentDate: refundDate,
        amount: -requestedAmount,
        amountUsedForInvoices: -Number(original.amountUsedForInvoices) * ratio,
        amountInExcess: -Number(original.amountInExcess) * ratio,
        bankCharges: 0,
        paymentMode: original.paymentMode,
        method: original.paymentMode,
        depositToAccountId: original.depositToAccountId,
        reference:
          input.reference ??
          (isPartial
            ? `Partial refund of ${original.number}`
            : `Refund of ${original.number}`),
        notes: input.notes ?? null,
      },
    });

    // Apply each allocation reversal.
    for (const r of reversals) {
      await tx.invoice.update({
        where: { id: r.invoiceId },
        data: { amountPaid: r.newAmountPaid, status: r.newStatus },
      });
    }

    // Soft-delete the original only on a full refund. For partial
    // refunds, leave it so further partials can chip at it.
    if (!isPartial) {
      await tx.paymentReceived.update({
        where: { id: original.id },
        data: { deletedAt: new Date() },
      });
    }
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: isPartial ? "UPDATE" : "DELETE",
    entityType: "PaymentReceived",
    entityId: id,
    after: {
      refunded: true,
      partial: isPartial,
      refundedAmount: requestedAmount,
      remainingAfter: remaining - requestedAmount,
      reversalNumber: refundNumber,
      ...(razorpayRefundId
        ? { source: "razorpay-merchant-initiated", razorpayRefundId }
        : {}),
    },
  });

  revalidatePath("/sales/payments-received");
  revalidatePath("/sales/invoices");
}

/**
 * Email a payment receipt to the customer. Uses the EmailJob queue.
 */
export async function emailPaymentReceiptAction(id: string): Promise<void> {
  const { user, organization } = await requireOrganization();
  const p = await db.paymentReceived.findFirst({
    where: { id, organizationId: organization.id, deletedAt: null },
    include: {
      contact: true,
      organization: true,
      allocations: { include: { invoice: true } },
    },
  });
  if (!p) throw new Error("Payment not found");
  if (!p.contact.email) throw new Error("Customer has no email on file");

  const lines = p.allocations
    .map(
      (a) =>
        `<li><strong>${a.invoice.number}</strong> — ${Number(a.amount).toFixed(2)}</li>`
    )
    .join("");

  const html = `
    <p>Hello ${p.contact.displayName},</p>
    <p>Thank you. We have received your payment <strong>${p.number}</strong> on
    ${format(p.paymentDate, "dd MMM yyyy")} for
    <strong>${Number(p.amount).toFixed(2)}</strong>
    (${p.paymentMode}).</p>
    ${lines ? `<p>Applied to:</p><ul>${lines}</ul>` : ""}
    ${p.notes ? `<p><em>${p.notes}</em></p>` : ""}
    <p>— ${p.organization.name}</p>
  `;

  await enqueueEmail({
    organizationId: organization.id,
    toEmail: p.contact.email,
    subject: `Payment receipt ${p.number} from ${p.organization.name}`,
    bodyHtml: html,
    documentType: "PAYMENT_RECEIVED",
    documentId: p.id,
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "CREATE",
    entityType: "PaymentReceiptEmail",
    entityId: id,
  });
  revalidatePath(`/sales/payments-received/${id}`);
}

export async function deletePaymentReceivedAction(id: string) {
  const { user, organization } = await requireOrganization();
  const p = await db.paymentReceived.findFirst({
    where: { id, organizationId: organization.id },
    include: { allocations: true },
  });
  if (!p) return { ok: false };
  if (p.allocations.length > 0) {
    return { ok: false, error: "Cannot delete payments with allocations" };
  }
  await db.$transaction(async (tx) => {
    await tx.paymentReceived.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    // RPT-B — defensive: a payment without allocations has no JEs
    // today, but the helper is a no-op on empty result so this is
    // safe and future-proofs any code that posts a JE for an
    // unallocated payment.
    await reversePaymentReceivedJes(tx, organization.id, id);
  });
  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "PaymentReceived",
    entityId: id,
    before: { number: p.number },
  });
  revalidatePath("/sales/payments-received");
  return { ok: true };
}

/**
 * Bulk delete per <payments_received_spec>. Mirrors the per-row guard:
 * payments with allocations are kept (financial integrity).
 */
export async function bulkDeletePaymentsAction(input: {
  ids: string[];
}): Promise<{ ok: boolean; updated?: number; error?: string }> {
  const { user, organization } = await requireOrganization();
  if (!input.ids?.length) return { ok: true, updated: 0 };
  const blocked = await db.paymentReceived.count({
    where: {
      id: { in: input.ids },
      organizationId: organization.id,
      allocations: { some: {} },
    },
  });
  if (blocked > 0) {
    return {
      ok: false,
      error: `${blocked} payment${blocked === 1 ? "" : "s"} with allocations cannot be deleted`,
    };
  }
  const result = await db.paymentReceived.updateMany({
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
    entityType: "PaymentReceived",
    entityId: `bulk-${Date.now()}`,
    before: { count: result.count, ids: input.ids },
  });
  revalidatePath("/sales/payments-received");
  return { ok: true, updated: result.count };
}
