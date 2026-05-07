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
    } else {
      // refund.processed and other events — log but don't error
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
