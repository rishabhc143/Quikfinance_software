"use client";

import * as React from "react";
import Link from "next/link";
import { Lightbulb, X } from "lucide-react";

/**
 * Light-bulb dismissible promo card linking to the partner-bank stub
 * page (`/settings/integrations/bill-pay-banks`). Used in three
 * places per spec:
 *   - Vendor → Bank Details tab
 *   - Payments Made → Bill Payment tab
 *   - Payments Made → Vendor Advance tab
 *
 * Dismissal is per-user/per-key via localStorage. Server doesn't need
 * to know about it.
 */
export function PartnerBankPromo({
  storageKey = "partner-bank-promo",
}: {
  storageKey?: string;
}) {
  const [dismissed, setDismissed] = React.useState(true);
  // Hydrate from localStorage on mount (avoid SSR flicker).
  React.useEffect(() => {
    try {
      const v = window.localStorage.getItem(`qf-dismiss:${storageKey}`);
      setDismissed(v === "1");
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  if (dismissed) return null;

  return (
    <div className="relative flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
      <Lightbulb
        className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5"
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        Initiate payments for your purchases directly from Quikfinance by
        integrating with one of our partner banks.{" "}
        <Link
          href="/settings/integrations/bill-pay-banks"
          className="font-medium text-primary hover:underline"
        >
          Set Up Now
        </Link>
      </div>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(`qf-dismiss:${storageKey}`, "1");
          } catch {
            // ignore
          }
        }}
        aria-label="Dismiss"
        className="text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
