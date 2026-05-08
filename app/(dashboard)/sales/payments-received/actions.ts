"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { writeAuditLog } from "@/lib/audit";
import { recordPaymentAction } from "../invoices/actions";
import { enqueueEmail } from "@/lib/sales/email-sender";
import { decryptSecret } from "@/lib/crypto";
import { createRazorpayRefund } from "@/lib/sales/razorpay";
import type { RecordPaymentInput } from "@/lib/validations/invoice";
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
  input: { refundDate: Date | string; reference?: string | null; notes?: string | null }
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

  const refundNumber = await (async () => {
    // Reuse same series; suffix the original number with "-R"
    return `${original.number}-R`;
  })();

  // M30: Razorpay-sourced payments — call Razorpay's /refund API first
  // so the merchant's Razorpay account actually moves the money. The
  // M22 webhook (refund.processed) will fire shortly after; its
  // idempotency check on attempt.status="REFUNDED" makes it a no-op
  // since we set that here.
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
      amountPaise: Math.round(Number(original.amount) * 100),
      notes: {
        reason: input.reference ?? input.notes ?? "Merchant-initiated refund",
        paymentReceivedId: original.id,
      },
    });
    if (!r.ok) {
      throw new Error(r.error ?? "Razorpay refund failed");
    }
    razorpayRefundId = r.refundId ?? null;
    // Mark the attempt REFUNDED right away. The M22 webhook is
    // idempotent — when refund.processed arrives later, it'll skip.
    await db.razorpayPaymentAttempt.update({
      where: { id: attempt.id },
      data: { status: "REFUNDED" },
    });
  }

  await db.$transaction(async (tx) => {
    // Create reversal row (negative amount, no new allocations)
    await tx.paymentReceived.create({
      data: {
        organizationId: organization.id,
        number: refundNumber,
        contactId: original.contactId,
        paymentDate: refundDate,
        amount: -Number(original.amount),
        amountUsedForInvoices: -Number(original.amountUsedForInvoices),
        amountInExcess: -Number(original.amountInExcess),
        bankCharges: 0,
        paymentMode: original.paymentMode,
        method: original.paymentMode,
        depositToAccountId: original.depositToAccountId,
        reference: input.reference ?? `Refund of ${original.number}`,
        notes: input.notes ?? null,
      },
    });

    // Unwind each allocation: decrement invoice.amountPaid and rollback status
    for (const a of original.allocations) {
      const inv = a.invoice;
      const newPaid = Math.max(0, Number(inv.amountPaid) - Number(a.amount));
      const newStatus =
        newPaid <= 0.0001
          ? inv.dueDate < new Date()
            ? "OVERDUE"
            : "SENT"
          : newPaid >= Number(inv.total) - 0.0001
          ? "PAID"
          : "PARTIALLY_PAID";
      await tx.invoice.update({
        where: { id: inv.id },
        data: { amountPaid: newPaid, status: newStatus },
      });
    }

    // Mark the original payment as deleted (soft) so it doesn't get
    // double-refunded
    await tx.paymentReceived.update({
      where: { id: original.id },
      data: { deletedAt: new Date() },
    });
  });

  await writeAuditLog({
    organizationId: organization.id,
    userId: user.id,
    action: "DELETE",
    entityType: "PaymentReceived",
    entityId: id,
    after: {
      refunded: true,
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
  await db.paymentReceived.update({
    where: { id },
    data: { deletedAt: new Date() },
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
