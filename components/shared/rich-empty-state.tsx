import * as React from "react";
import Link from "next/link";
import { Plus, Download, Check, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shared rich empty-state primitive — used by Sales + Purchases list
 * pages (Customers/Vendors/Invoices/Quotes/Bills/POs/etc).
 *
 * Layout matches the user-supplied mockup: an avatar-style icon with
 * a "+" badge overlay, a centered heading + subtitle, two CTAs, an
 * optional "Import using" social row, and a Key Benefits card with
 * a 2-column grid of green check marks.
 *
 * Each module passes its own icon, copy, and CTAs. The simpler
 * `SimpleEmptyState` (in `data-table.tsx`) is the lighter sibling
 * for tables where the rich treatment is overkill.
 */
export type EmptyAction = {
  label: string;
  href: string;
};

export function RichEmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  importUsingHref,
  benefits,
}: {
  /** Lucide icon component (rendered at h-24 w-24 with stroke-1.5). */
  icon: LucideIcon;
  title: string;
  description: string;
  primaryAction: EmptyAction;
  /** When omitted, the secondary "Import" button + "- or -" row are hidden. */
  secondaryAction?: EmptyAction;
  /**
   * When set, the "- or - Import using" row appears with three brand
   * icons (cloud, Google, Microsoft) all linking to this href.
   */
  importUsingHref?: string;
  benefits: string[];
}) {
  const Icon = icon;
  return (
    <div className="flex flex-col items-center max-w-2xl mx-auto py-8">
      {/* Icon with + badge */}
      <div className="relative mb-6">
        <Icon
          className="h-24 w-24 text-muted-foreground/60"
          strokeWidth={1.5}
        />
        <div className="absolute -bottom-1 right-0 h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center ring-2 ring-background">
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        </div>
      </div>

      <h2 className="text-xl font-semibold mb-2 text-center">{title}</h2>
      <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
        {description}
      </p>

      {/* CTAs */}
      <div className="flex items-center gap-3 mb-6">
        <Button asChild className="gap-1">
          <Link href={primaryAction.href}>
            <Plus className="h-4 w-4" /> {primaryAction.label}
          </Link>
        </Button>
        {secondaryAction ? (
          <Button asChild variant="outline" className="gap-1">
            <Link href={secondaryAction.href}>
              <Download className="h-4 w-4" /> {secondaryAction.label}
            </Link>
          </Button>
        ) : null}
      </div>

      {/* "- or -" + social import icons */}
      {importUsingHref ? (
        <>
          <div className="text-xs text-muted-foreground mb-3">- or -</div>
          <div className="flex items-center gap-3 mb-10">
            <span className="text-xs text-muted-foreground">Import using</span>
            {/* Cloud / Google / Microsoft contact import — these aren't
                wired yet (OAuth apps not registered). Shown as disabled
                so users know they exist; CSV import (the button above)
                works today. See docs/contact-import-design.md. */}
            <span
              aria-label="Import via cloud storage — coming soon"
              title="Cloud import coming soon — use Import File above for CSVs today"
              className="rounded-full p-1 opacity-40 cursor-not-allowed"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="#3b82f6"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
              </svg>
            </span>
            <span
              aria-label="Import from Google — coming soon"
              title="Google Contacts import coming soon — use Import File above for CSVs today"
              className="rounded-full p-1 opacity-40 cursor-not-allowed"
            >
              <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
                <path
                  fill="#FFC107"
                  d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
                />
                <path
                  fill="#FF3D00"
                  d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
                />
                <path
                  fill="#4CAF50"
                  d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
                />
                <path
                  fill="#1976D2"
                  d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
                />
              </svg>
            </span>
            <span
              aria-label="Import from Microsoft — coming soon"
              title="Microsoft Contacts import coming soon — use Import File above for CSVs today"
              className="rounded-full p-1 opacity-40 cursor-not-allowed"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
                <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
                <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
              </svg>
            </span>
          </div>
        </>
      ) : null}

      {/* Key Benefits card — uses semantic `success` / `warning` tokens so
          the accent block + check marks track the brand emerald palette,
          not a hardcoded amber-100 / emerald-600 (those don't update
          when the palette changes). */}
      <div className="w-full rounded-lg border bg-card px-6 py-5">
        <div className="flex items-center gap-2 mb-4">
          <span
            className="inline-block h-4 w-4 rounded-sm bg-warning/15"
            aria-hidden
          />
          <span className="text-sm font-semibold">Key Benefits</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-8">
          {benefits.map((benefit) => (
            <div key={benefit} className="flex items-start gap-2 text-sm">
              <Check
                className="h-4 w-4 text-success mt-0.5 shrink-0"
                strokeWidth={3}
                aria-hidden
              />
              <span>{benefit}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
