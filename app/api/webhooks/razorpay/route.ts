import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { writeAuditLog } from "@/lib/audit";
import { enqueueEmail } from "@/lib/sales/email-sender";
import { getNextDocumentNumber } from "@/lib/sales/numbering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * M17b: Razorpay webhook receiver.
 *
 * - Reads the raw body via req.text() so the signature check operates
 *   on bytes Razorpay actually signed (must NOT JSON.parse first).
 * - Resolves the org by trying every razorpayEnabled org's webhook
 *   secret in turn — Razorpay sends one signature, and orgs share the
 *   same /api/webhooks/razorpay endpoint.
 * - On payment.captured: idempotent on razorpayPaymentId. Inside a
 *   single transaction creates PaymentReceived + PaymentReceivedAllocation,
 *   updates invoice balance/status, writes AuditLog, enqueues a receipt
 *   email. On payment.failed: marks the attempt FAILED. Returns 200
 *   either way to avoid Razorpay retry storms — ours errors are logged.
 */

type RazorpayEvent = {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        status?: string;
        method?: string;
        error_code?: string;
        error_description?: string;
        notes?: Record<string, string>;
      };
    };
    // M22: refund.processed payload shape per Razorpay docs.
    refund?: {
      entity?: {
        id?: string;
        payment_id?: string;
        amount?: number;
        currency?: string;
        status?: string;
        notes?: Record<string, string>;
      };
    };
  };
};

async function findMatchingOrg(rawBody: string, signature: string) {
  const orgs = await db.paymentGatewayConfig.findMany({
    where: {
      razorpayEnabled: true,
      razorpayWebhookSecretEncrypted: { not: null },
    },
    select: {
      organizationId: true,
      razorpayWebhookSecretEncrypted: true,
    },
  });
  for (const o of orgs) {
    if (!o.razorpayWebhookSecretEncrypted) continue;
    let secret: string;
    try {
      secret = decryptSecret(o.razorpayWebhookSecretEncrypted);
    } catch {
      continue;
    }
    const expected = createHmac("sha256", secret).update(rawBody).digest();
    let actual: Buffer;
    try {
      actual = Buffer.from(signature, "hex");
    } catch {
      continue;
    }
    if (expected.length !== actual.length) continue;
    if (timingSafeEqual(expected, actual)) {
      return o.organizationId;
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const orgId = await findMatchingOrg(rawBody, signature);
  if (!orgId) {
    return NextResponse.json(
      { error: "Signature verification failed" },
      { status: 401 }
    );
  }

  let event: RazorpayEvent;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (event.event === "payment.captured") {
      await handlePaymentCaptured(orgId, event);
    } else if (event.event === "payment.failed") {
      await handlePaymentFailed(orgId, event);
    } else if (event.event === "refund.processed") {
      await handleRefundProcessed(orgId, event);
    } else {
      // eslint-disable-next-line no-console
      console.log("[razorpay] ignoring event", event.event);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[razorpay] handler error", err);
    // Still return 200 — surface internally via logs but keep Razorpay
    // from retrying forever.
  }

  return NextResponse.json({ ok: true });
}

async function handlePaymentCaptured(orgId: string, event: RazorpayEvent) {
  const p = event.payload?.payment?.entity;
  if (!p?.id || !p.order_id || !p.amount || !p.currency) return;

  const existing = await db.razorpayPaymentAttempt.findUnique({
    where: { razorpayPaymentId: p.id },
  });
  if (existing && existing.status === "CAPTURED") {
    // Idempotent — already processed
    return;
  }

  const attempt = await db.razorpayPaymentAttempt.findUnique({
    where: { razorpayOrderId: p.order_id },
  });
  if (!attempt) {
    // Webhook fired for an order we didn't create — possible test event
    // or stale payment. Skip.
    return;
  }

  const inv = await db.invoice.findFirst({
    where: { id: attempt.invoiceId, organizationId: orgId, deletedAt: null },
    include: { contact: true, organization: true },
  });
  if (!inv) return;

  const amountReceived = p.amount / 100;
  const ccy = p.currency;

  // Locate the Razorpay Clearing Account bank-account to deposit into.
  const clearing = await db.bankAccount.findFirst({
    where: {
      organizationId: orgId,
      name: "Razorpay Clearing Account",
    },
    select: { id: true },
  });

  const number = await getNextDocumentNumber(orgId, "PAYMENT_RECEIVED");

  await db.$transaction(async (tx) => {
    const pr = await tx.paymentReceived.create({
      data: {
        organizationId: orgId,
        number,
        contactId: inv.contactId,
        paymentDate: new Date(),
        amount: amountReceived,
        amountUsedForInvoices: amountReceived,
        amountInExcess: 0,
        bankCharges: 0,
        paymentMode: "razorpay",
        method: "razorpay",
        reference: p.id,
        depositToAccountId: clearing?.id ?? null,
        notes: `Razorpay order ${p.order_id} — payment ${p.id}`,
      },
    });

    await tx.paymentReceivedAllocation.create({
      data: {
        paymentReceivedId: pr.id,
        invoiceId: inv.id,
        amount: amountReceived,
      },
    });

    const newAmountPaid = Number(inv.amountPaid) + amountReceived;
    const total = Number(inv.total);
    const newStatus =
      newAmountPaid >= total - 0.0001
        ? "PAID"
        : newAmountPaid > 0
        ? "PARTIALLY_PAID"
        : inv.status;
    await tx.invoice.update({
      where: { id: inv.id },
      data: {
        amountPaid: newAmountPaid,
        status: newStatus,
      },
    });

    await tx.razorpayPaymentAttempt.update({
      where: { id: attempt.id },
      data: {
        razorpayPaymentId: p.id,
        status: "CAPTURED",
        signatureVerified: true,
        webhookPayload: event as unknown as object,
        paymentReceivedId: pr.id,
      },
    });
  });

  await writeAuditLog({
    organizationId: orgId,
    userId: null,
    action: "CREATE",
    entityType: "PaymentReceived",
    entityId: inv.id,
    after: {
      source: "razorpay-webhook",
      orderId: p.order_id,
      paymentId: p.id,
      amount: amountReceived,
      currency: ccy,
    },
  });

  if (inv.contact.email) {
    await enqueueEmail({
      organizationId: orgId,
      toEmail: inv.contact.email,
      subject: `Payment received — Invoice ${inv.number}`,
      bodyHtml: `<p>Hello ${inv.contact.displayName},</p>
<p>We've received your payment of <strong>${amountReceived.toFixed(2)} ${ccy}</strong> against invoice <strong>${inv.number}</strong> via Razorpay.</p>
<p>Reference: ${p.id}</p>
<p>Thank you,<br/>${inv.organization.name}</p>`,
      documentType: "PAYMENT_RECEIVED",
      documentId: inv.id,
    });
  }
}

async function handlePaymentFailed(orgId: string, event: RazorpayEvent) {
  const p = event.payload?.payment?.entity;
  if (!p?.id || !p.order_id) return;
  const attempt = await db.razorpayPaymentAttempt.findUnique({
    where: { razorpayOrderId: p.order_id },
  });
  if (!attempt) return;
  await db.razorpayPaymentAttempt.update({
    where: { id: attempt.id },
    data: {
      razorpayPaymentId: p.id,
      status: "FAILED",
      failureReason: p.error_description ?? p.error_code ?? null,
      webhookPayload: event as unknown as object,
      signatureVerified: true,
    },
  });
  await writeAuditLog({
    organizationId: orgId,
    userId: null,
    action: "UPDATE",
    entityType: "RazorpayPaymentAttempt",
    entityId: attempt.id,
    after: {
      source: "razorpay-webhook",
      status: "FAILED",
      reason: p.error_description ?? p.error_code,
    },
  });
}

/**
 * M22: refund.processed handler.
 *
 * Razorpay sends this when a previously-captured payment is refunded
 * (full or partial). The payload references the original payment via
 * `payment_id`, which we already linked to a PaymentReceived row in
 * handlePaymentCaptured. We:
 *   1. Look up the RazorpayPaymentAttempt by razorpayPaymentId
 *      (idempotent against duplicate webhook deliveries — if the
 *      attempt is already REFUNDED, we no-op)
 *   2. Inside a single transaction, reverse the matching
 *      PaymentReceivedAllocation rows by subtracting from
 *      Invoice.amountPaid + recomputing Invoice.status
 *   3. Soft-delete the PaymentReceived
 *   4. Mark the attempt status=REFUNDED with the webhook payload
 *   5. Write AuditLog + enqueue a refund-confirmation email
 *
 * Partial refunds: per Razorpay docs, refund.amount is the refunded
 * amount in paise. We reverse exactly that amount, distributing it
 * across the original allocations proportionally.
 */
async function handleRefundProcessed(orgId: string, event: RazorpayEvent) {
  const r = event.payload?.refund?.entity;
  if (!r?.id || !r.payment_id || !r.amount) return;

  const attempt = await db.razorpayPaymentAttempt.findUnique({
    where: { razorpayPaymentId: r.payment_id },
  });
  if (!attempt) {
    // Refund for a payment we don't track — log and skip
    // eslint-disable-next-line no-console
    console.warn(
      "[razorpay] refund for unknown payment",
      r.payment_id,
      "refund",
      r.id
    );
    return;
  }
  if (attempt.status === "REFUNDED") {
    // Idempotent — duplicate delivery
    return;
  }

  const refundAmount = r.amount / 100;
  const ccy = r.currency ?? attempt.currency;

  if (!attempt.paymentReceivedId) {
    // Edge case: payment.captured was processed but PaymentReceived
    // wasn't linked. Mark the attempt anyway and audit.
    await db.razorpayPaymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "REFUNDED",
        webhookPayload: event as unknown as object,
        signatureVerified: true,
      },
    });
    await writeAuditLog({
      organizationId: orgId,
      userId: null,
      action: "UPDATE",
      entityType: "RazorpayPaymentAttempt",
      entityId: attempt.id,
      after: {
        source: "razorpay-webhook",
        status: "REFUNDED",
        amount: refundAmount,
        refundId: r.id,
        note: "no PaymentReceived linked — refund recorded on attempt only",
      },
    });
    return;
  }

  const pr = await db.paymentReceived.findUnique({
    where: { id: attempt.paymentReceivedId },
    include: { allocations: true, contact: true, organization: true },
  });
  if (!pr || pr.deletedAt) {
    // Payment already deleted / not found — record refund on attempt
    await db.razorpayPaymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "REFUNDED",
        webhookPayload: event as unknown as object,
        signatureVerified: true,
      },
    });
    return;
  }

  // Distribute the refund proportionally across allocations. With a
  // single allocation (the typical webhook-created payment) this is a
  // straight subtract from the lone invoice's amountPaid.
  const totalAllocated = pr.allocations.reduce(
    (sum, a) => sum + Number(a.amount),
    0
  );

  await db.$transaction(async (tx) => {
    for (const alloc of pr.allocations) {
      const share =
        totalAllocated > 0
          ? Number(alloc.amount) / totalAllocated
          : 1 / pr.allocations.length;
      const reverse = refundAmount * share;
      const inv = await tx.invoice.findUnique({
        where: { id: alloc.invoiceId },
      });
      if (!inv) continue;
      const newAmountPaid = Math.max(
        0,
        Number(inv.amountPaid) - reverse
      );
      const total = Number(inv.total);
      const newStatus =
        newAmountPaid >= total - 0.0001
          ? "PAID"
          : newAmountPaid > 0
          ? "PARTIALLY_PAID"
          : inv.status === "PAID" || inv.status === "PARTIALLY_PAID"
          ? "SENT"
          : inv.status;
      await tx.invoice.update({
        where: { id: alloc.invoiceId },
        data: { amountPaid: newAmountPaid, status: newStatus },
      });
    }

    // Soft-delete the PaymentReceived once all allocations have been
    // reversed. (Partial refunds in v1 still soft-delete — partial
    // refund accounting can be split into a follow-up.)
    await tx.paymentReceived.update({
      where: { id: pr.id },
      data: {
        deletedAt: new Date(),
        notes:
          (pr.notes ?? "") +
          ` [REFUNDED ${refundAmount.toFixed(2)} ${ccy} via Razorpay refund ${r.id}]`,
      },
    });

    await tx.razorpayPaymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "REFUNDED",
        webhookPayload: event as unknown as object,
        signatureVerified: true,
      },
    });
  });

  await writeAuditLog({
    organizationId: orgId,
    userId: null,
    action: "UPDATE",
    entityType: "PaymentReceived",
    entityId: pr.id,
    after: {
      source: "razorpay-webhook",
      event: "refund.processed",
      refundId: r.id,
      paymentId: r.payment_id,
      amount: refundAmount,
      currency: ccy,
    },
  });

  if (pr.contact.email) {
    await enqueueEmail({
      organizationId: orgId,
      toEmail: pr.contact.email,
      subject: `Refund processed for payment ${pr.number}`,
      bodyHtml: `<p>Hello ${pr.contact.displayName},</p>
<p>Your refund of <strong>${refundAmount.toFixed(2)} ${ccy}</strong> for payment <strong>${pr.number}</strong> has been processed by Razorpay.</p>
<p>Reference: ${r.id}</p>
<p>Thank you,<br/>${pr.organization.name}</p>`,
      documentType: "PAYMENT_REFUND",
      documentId: pr.id,
    });
  }
}
