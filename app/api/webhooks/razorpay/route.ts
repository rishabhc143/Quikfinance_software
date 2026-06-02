import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { writeAuditLog } from "@/lib/audit";
import { enqueueEmail } from "@/lib/sales/email-sender";
import { getNextDocumentNumber } from "@/lib/sales/numbering";
import {
  verifyRazorpaySignature,
  distributeRefundAcrossAllocations,
} from "@/lib/sales/razorpay-webhook";

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
 *   email. On payment.failed: marks the attempt FAILED.
 * - Return-code policy (CRIT-4 audit fix):
 *     200 — handler completed (or no-oped on idempotent retry / unknown event)
 *     400 — missing signature header / malformed JSON
 *     401 — signature didn't match any org's webhook secret
 *     500 — critical-path failure (DB transaction, attempt-status update)
 *           so Razorpay retries on transient errors (DB blip, network, etc).
 *           Side-effects (audit, email) are wrapped in inner try/catch
 *           so they can't trigger retries on already-recorded payments.
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
    if (verifyRazorpaySignature(rawBody, signature, secret)) {
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
    // CRIT-4: critical-path failure inside a handler (DB transaction,
    // attempt-status update). Return 500 so Razorpay retries — its
    // backoff is capped (~24h max per docs), better than silent
    // payment/refund loss. Side-effects (audit/email) are wrapped in
    // inner try/catch inside each handler so they can't reach here.
    // eslint-disable-next-line no-console
    console.error("[razorpay] critical-path handler error", err);
    return NextResponse.json(
      { ok: false, error: "Handler failure — retry expected" },
      { status: 500 }
    );
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

  // Side-effects: payment is recorded above. Audit + email are
  // best-effort — log on failure but don't propagate (would cause
  // Razorpay to retry the entire idempotent payment).
  try {
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
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[razorpay] audit failed (payment.captured)", {
      paymentId: p.id,
      err,
    });
  }

  if (inv.contact.email) {
    try {
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
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[razorpay] email failed (payment.captured)", {
        paymentId: p.id,
        err,
      });
    }
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
  // Side-effect: attempt is already marked FAILED above. Audit is
  // best-effort.
  try {
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
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[razorpay] audit failed (payment.failed)", {
      paymentId: p.id,
      err,
    });
  }
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
    // Side-effect: attempt status updated above. Audit best-effort.
    try {
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
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[razorpay] audit failed (refund.processed edge)", {
        refundId: r.id,
        err,
      });
    }
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
  const invoices = await Promise.all(
    pr.allocations.map((alloc) =>
      db.invoice.findUnique({ where: { id: alloc.invoiceId } })
    )
  );
  const reversalInputs = pr.allocations
    .map((alloc, i) => {
      const inv = invoices[i];
      if (!inv) return null;
      return {
        invoiceId: alloc.invoiceId,
        amount: Number(alloc.amount),
        invoiceAmountPaid: Number(inv.amountPaid),
        invoiceTotal: Number(inv.total),
        invoiceStatus: inv.status,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const reversals = distributeRefundAcrossAllocations(
    refundAmount,
    reversalInputs
  );

  await db.$transaction(async (tx) => {
    for (const r of reversals) {
      await tx.invoice.update({
        where: { id: r.invoiceId },
        data: { amountPaid: r.newAmountPaid, status: r.newStatus as never },
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

  // Side-effects: refund reversal transaction committed above. Audit
  // + email are best-effort — log on failure but don't propagate.
  try {
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
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[razorpay] audit failed (refund.processed)", {
      refundId: r.id,
      err,
    });
  }

  if (pr.contact.email) {
    try {
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
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[razorpay] email failed (refund.processed)", {
        refundId: r.id,
        err,
      });
    }
  }
}
