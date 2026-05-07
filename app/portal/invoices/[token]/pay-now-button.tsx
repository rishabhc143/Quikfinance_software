"use client";

import * as React from "react";
import Script from "next/script";
import { Loader2 } from "lucide-react";

/**
 * M17b: client-only "Pay Now" button rendered on the customer portal.
 * Loads Razorpay Checkout (https://checkout.razorpay.com/v1/checkout.js),
 * fetches a fresh order via /api/razorpay/order, and opens the
 * Razorpay modal. Trust the webhook for actual state changes; the
 * client callback only triggers a router refresh.
 */

declare global {
  interface Window {
    Razorpay: new (opts: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, cb: (data: unknown) => void) => void;
    };
  }
}

export function PayNowButton({
  portalToken,
  customerName,
  customerEmail,
  invoiceNumber,
  organizationName,
}: {
  portalToken: string;
  customerName: string;
  customerEmail?: string | null;
  invoiceNumber: string;
  organizationName: string;
}) {
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const scriptLoaded = React.useRef(false);

  async function onClick() {
    if (busy) return;
    if (!scriptLoaded.current || typeof window.Razorpay !== "function") {
      window.alert("Razorpay Checkout is still loading. Please try again.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/razorpay/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ portalToken }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        window.alert(err?.error ?? "Failed to start payment");
        return;
      }
      const { orderId, keyId, amount, currency } = (await res.json()) as {
        orderId: string;
        keyId: string;
        amount: number;
        currency: string;
      };
      const rzp = new window.Razorpay({
        key: keyId,
        order_id: orderId,
        amount,
        currency,
        name: organizationName,
        description: `Invoice ${invoiceNumber}`,
        prefill: customerEmail
          ? { name: customerName, email: customerEmail }
          : { name: customerName },
        notes: { invoiceNumber, portalToken },
        handler: () => {
          // Client-side callback. NOT trusted for state — the webhook
          // is what actually flips the invoice. We just show a friendly
          // toast and refresh.
          setDone(true);
          setTimeout(() => window.location.reload(), 1500);
        },
        modal: {
          ondismiss: () => {
            setBusy(false);
          },
        },
        theme: { color: "#3395ff" },
      });
      rzp.on("payment.failed", (data) => {
        // eslint-disable-next-line no-console
        console.error("[razorpay] payment failed", data);
      });
      rzp.open();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to start payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onLoad={() => {
          scriptLoaded.current = true;
        }}
      />
      <button
        type="button"
        onClick={onClick}
        disabled={busy || done}
        className="inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
        {done ? "Payment received — refreshing…" : "Pay Now"}
      </button>
    </>
  );
}
