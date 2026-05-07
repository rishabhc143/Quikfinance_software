import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { createRazorpayOrder } from "@/lib/sales/razorpay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * M17b: server endpoint that creates a Razorpay order for an invoice.
 * Called by the customer-portal "Pay Now" button — no dashboard
 * session is required because the portal is publicly accessible by
 * token. The token doubles as authorization here.
 *
 * Returns `{ orderId, keyId, amount, currency }` on success — the
 * client opens Razorpay Checkout with these values.
 */

const bodySchema = z.object({
  portalToken: z.string().min(8),
});

export async function POST(req: NextRequest) {
  let parsed: { portalToken: string };
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const inv = await db.invoice.findUnique({
    where: { portalAccessToken: parsed.portalToken },
    include: { organization: true },
  });
  if (!inv || inv.deletedAt) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const balance = Number(inv.total) - Number(inv.amountPaid);
  if (balance <= 0.0001) {
    return NextResponse.json(
      { error: "Invoice has no outstanding balance" },
      { status: 400 }
    );
  }
  if (!["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(inv.status)) {
    return NextResponse.json(
      { error: `Cannot pay invoice in status ${inv.status}` },
      { status: 400 }
    );
  }

  const cfg = await db.paymentGatewayConfig.findUnique({
    where: { organizationId: inv.organizationId },
  });
  if (!cfg || !cfg.razorpayEnabled || !cfg.razorpayKeyId || !cfg.razorpayKeySecretEncrypted) {
    return NextResponse.json(
      { error: "Razorpay is not configured for this organization" },
      { status: 503 }
    );
  }

  let keySecret: string;
  try {
    keySecret = decryptSecret(cfg.razorpayKeySecretEncrypted);
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt Razorpay credentials" },
      { status: 500 }
    );
  }

  const ccy = inv.currency ?? inv.organization.currency ?? "INR";
  const amountPaise = Math.round(balance * 100);

  const order = await createRazorpayOrder({
    keyId: cfg.razorpayKeyId,
    keySecret,
    amountPaise,
    currency: ccy,
    receipt: inv.number,
    notes: {
      organizationId: inv.organizationId,
      invoiceId: inv.id,
    },
  });
  if (!order.ok || !order.orderId) {
    return NextResponse.json(
      { error: order.error ?? "Failed to create Razorpay order" },
      { status: 502 }
    );
  }

  await db.razorpayPaymentAttempt.create({
    data: {
      organizationId: inv.organizationId,
      invoiceId: inv.id,
      razorpayOrderId: order.orderId,
      amount: balance,
      currency: ccy,
      status: "CREATED",
    },
  });

  return NextResponse.json({
    orderId: order.orderId,
    keyId: cfg.razorpayKeyId,
    amount: amountPaise,
    currency: ccy,
  });
}
