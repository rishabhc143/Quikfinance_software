"use client";

import * as React from "react";
import Link from "next/link";
import { Sparkles, X, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * BNK-J/K teaser — the "Connect and Add Your Bank Accounts or Credit
 * Cards" picker shown when the user clicks "Connect Bank / Credit
 * Card" from /banking. Matches the Zoho Books layout 1:1:
 *
 *   1. Partner Banks Fetch feeds directly — a horizontal strip of
 *      direct-API integration partners (BNK-K targets)
 *   2. Automatic Bank Feeds Supported Banks — a grid of banks
 *      reachable via a third-party feed aggregator like Yodlee (BNK-J)
 *   3. Add bank or credit card account manually — the only section
 *      that's fully functional in today's build; routes to the
 *      existing /banking/accounts/new form
 *
 * Until BNK-J and BNK-K ship, sections 1 + 2 render visually but
 * every card / Connect Now click opens a "Bank feeds coming soon"
 * dialog with an "Add Manually" CTA so the user doesn't dead-end.
 *
 * The bank name + a color-coded initial badge replace bank logos
 * (we don't ship third-party trademarks). The layout is otherwise
 * pixel-faithful to the reference.
 */

type PartnerBank = { id: string; name: string; color: string };

const PARTNER_BANKS: PartnerBank[] = [
  { id: "standard-chartered", name: "Standard Chartered", color: "bg-emerald-600" },
  { id: "hsbc", name: "HSBC", color: "bg-red-600" },
  { id: "kotak", name: "Kotak Mahindra", color: "bg-blue-600" },
  { id: "sbi", name: "SBI", color: "bg-indigo-700" },
  { id: "axis", name: "Axis Bank", color: "bg-rose-700" },
];

type SupportedBank = {
  id: string;
  name: string;
  color: string;
  /** Credit card marker — rendered as a small "C" pill in the corner. */
  isCreditCard?: boolean;
};

const SUPPORTED_BANKS: SupportedBank[] = [
  { id: "paypal", name: "PayPal", color: "bg-sky-600" },
  { id: "icici", name: "ICICI Bank (India)", color: "bg-orange-600" },
  { id: "hdfc", name: "HDFC Bank (India)", color: "bg-red-700" },
  { id: "sbi-banking", name: "State Bank of India (India) - Banking", color: "bg-indigo-700" },
  { id: "kotak-banking", name: "Kotak Mahindra Bank (India)", color: "bg-blue-600" },
  { id: "axis-banking", name: "Axis Bank (India)", color: "bg-rose-700" },
  { id: "hdfc-cc", name: "HDFC Bank (India) - Credit Card", color: "bg-red-700", isCreditCard: true },
  { id: "sbi-cc", name: "State Bank of India Credit Cards (India)", color: "bg-indigo-700", isCreditCard: true },
  { id: "amex", name: "American Express Cards (India)", color: "bg-cyan-700", isCreditCard: true },
];

function BankInitial({
  name,
  color,
  size = "md",
}: {
  name: string;
  color: string;
  size?: "md" | "sm";
}) {
  // First letter of each space-separated word, max 2 chars.
  const initials = name
    .replace(/\(.+?\)/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const dim = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";
  return (
    <div
      className={`flex items-center justify-center rounded-md font-semibold text-white ${color} ${dim}`}
      aria-hidden
    >
      {initials}
    </div>
  );
}

export function BankingConnectPicker() {
  const [comingSoonOpen, setComingSoonOpen] = React.useState(false);
  const [pendingBank, setPendingBank] = React.useState<string | null>(null);

  const openComingSoon = (bankName: string | null) => {
    setPendingBank(bankName);
    setComingSoonOpen(true);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      {/* Header — matches Zoho's sparkle + title + close-X layout. */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-1 h-5 w-5 text-amber-500" aria-hidden />
          <div>
            <h1 className="text-base font-semibold">
              Connect and Add Your Bank Accounts or Credit Cards
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Connect your bank accounts to fetch the bank feeds using one of
              our third-party bank feeds service providers. Or, you can add
              your bank accounts manually and import bank feeds.
            </p>
          </div>
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Close">
          <Link href="/banking">
            <X className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* Section 1 — Partner Banks (horizontal strip) */}
      <div className="flex flex-col items-start gap-3 rounded-md border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center">
        <div className="text-sm font-medium sm:w-44 sm:shrink-0">
          Partner Banks Fetch feeds directly
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {PARTNER_BANKS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => openComingSoon(b.name)}
              className="flex items-center gap-2 rounded border bg-background px-3 py-2 text-xs font-medium transition hover:border-primary/40 hover:bg-primary/5"
              aria-label={`${b.name} — coming soon`}
            >
              <BankInitial name={b.name} color={b.color} size="sm" />
              {b.name}
            </button>
          ))}
        </div>
      </div>

      {/* Section 2 — Automatic Bank Feeds Supported Banks */}
      <div className="rounded-md border">
        <div className="flex items-start justify-between gap-4 border-b bg-muted/30 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">
              Automatic Bank Feeds Supported Banks
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Connect your bank accounts and fetch the bank feeds using one of
              our third-party bank feeds service providers.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => openComingSoon(null)}
            className="shrink-0"
          >
            Connect Now
          </Button>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-2 lg:grid-cols-3">
          {SUPPORTED_BANKS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => openComingSoon(b.name)}
              className="relative flex items-center gap-3 rounded-md border bg-background px-4 py-3 text-left text-sm transition hover:border-primary/40 hover:bg-primary/5"
            >
              <BankInitial name={b.name} color={b.color} />
              <span className="truncate font-medium">{b.name}</span>
              {b.isCreditCard ? (
                <span
                  className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold text-white"
                  aria-label="Credit Card"
                  title="Credit Card"
                >
                  C
                </span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 border-t px-5 py-3 text-xs text-muted-foreground">
          <span
            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[10px] font-bold text-white"
            aria-hidden
          >
            C
          </span>
          <span aria-hidden>→</span>
          <span>Credit Card</span>
        </div>
      </div>

      {/* Section 3 — Manual add (fully functional) */}
      <div className="rounded-md border">
        <div className="flex flex-col items-start justify-between gap-3 border-b bg-muted/30 px-5 py-4 sm:flex-row sm:items-center">
          <div className="flex items-start gap-2">
            <CreditCard className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold">
              Add bank or credit card account manually
            </h2>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href="/banking/accounts/new">Add Account</Link>
          </Button>
        </div>
        <p className="px-5 py-4 text-xs text-muted-foreground">
          Unable to connect your bank or credit card account using our Service
          Provider? Add the accounts manually using your account details.
        </p>
      </div>

      <Dialog open={comingSoonOpen} onOpenChange={setComingSoonOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Live bank feeds are coming soon</DialogTitle>
            <DialogDescription>
              {pendingBank
                ? `We're rolling out automatic feeds for ${pendingBank} soon. For now you can add this account manually with your account details — CSV / OFX / QIF imports are fully supported once the account exists.`
                : "We're rolling out automatic bank feeds soon. For now you can add accounts manually with your details — CSV / OFX / QIF imports are fully supported once an account exists."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComingSoonOpen(false)}>
              Cancel
            </Button>
            <Button asChild>
              <Link href="/banking/accounts/new">Add Manually</Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
