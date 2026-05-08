/**
 * Tiny wrapper around the Razorpay REST API. Keeps the fetch logic in
 * one place so the order route, webhook handler, and the
 * test-connection action all use the same auth header builder + error
 * shape.
 *
 * Razorpay's REST API uses HTTP Basic auth with `keyId:keySecret`.
 * Test keys begin with `rzp_test_` and live keys with `rzp_live_`.
 */

const BASE = "https://api.razorpay.com/v1";

function basicAuth(keyId: string, keySecret: string): string {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
}

export async function razorpayFetch<T = unknown>(opts: {
  path: string; // "/orders", "/payments?count=1", etc.
  method?: "GET" | "POST";
  body?: unknown;
  keyId: string;
  keySecret: string;
}): Promise<{ ok: boolean; status: number; data: T | null; error?: string }> {
  const { path, method = "GET", body, keyId, keySecret } = opts;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: basicAuth(keyId, keySecret),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  let data: T | null = null;
  let error: string | undefined;
  try {
    const text = await res.text();
    if (text) {
      const parsed = JSON.parse(text);
      if (res.ok) data = parsed as T;
      else error = parsed?.error?.description ?? `HTTP ${res.status}`;
    } else if (!res.ok) {
      error = `HTTP ${res.status}`;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to parse Razorpay response";
  }
  return { ok: res.ok, status: res.status, data, error };
}

/** Create a Razorpay order. Amount must be in paise (integer). */
export async function createRazorpayOrder(input: {
  keyId: string;
  keySecret: string;
  amountPaise: number;
  currency: string; // "INR"
  receipt?: string;
  notes?: Record<string, string>;
}): Promise<{
  ok: boolean;
  orderId?: string;
  error?: string;
}> {
  const r = await razorpayFetch<{ id: string }>({
    path: "/orders",
    method: "POST",
    body: {
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes,
    },
    keyId: input.keyId,
    keySecret: input.keySecret,
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, orderId: r.data?.id };
}

/** Connectivity check used by Test Connection in the setup modal. */
export async function pingRazorpay(input: {
  keyId: string;
  keySecret: string;
}): Promise<{ ok: boolean; error?: string }> {
  const r = await razorpayFetch({
    path: "/payments?count=1",
    keyId: input.keyId,
    keySecret: input.keySecret,
  });
  return { ok: r.ok, error: r.error };
}

/**
 * M30: initiate a refund for a captured Razorpay payment. Razorpay
 * accepts an optional `amount` for partial refunds (in paise). Omitting
 * it refunds the full payment.
 *
 * Returns the refund id on success. The merchant's webhook
 * (refund.processed) will fire shortly after — local app state is
 * reconciled there. The caller should also do the local reversal
 * synchronously so the user sees immediate feedback (the M22 webhook
 * handler is idempotent on attempt.status="REFUNDED" so the duplicate
 * delivery is a no-op).
 */
export async function createRazorpayRefund(input: {
  keyId: string;
  keySecret: string;
  paymentId: string;
  amountPaise?: number;
  notes?: Record<string, string>;
}): Promise<{ ok: boolean; refundId?: string; error?: string }> {
  const body: Record<string, unknown> = {};
  if (input.amountPaise !== undefined) body.amount = input.amountPaise;
  if (input.notes) body.notes = input.notes;
  const r = await razorpayFetch<{ id: string }>({
    path: `/payments/${encodeURIComponent(input.paymentId)}/refund`,
    method: "POST",
    body,
    keyId: input.keyId,
    keySecret: input.keySecret,
  });
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, refundId: r.data?.id };
}
