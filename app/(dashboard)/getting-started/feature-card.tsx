"use client";
import * as React from "react";
import Link from "next/link";
import { PlayCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * GETTING-STARTED — One card in the "Explore useful features" grid.
 *
 * Matches the Zoho screenshot:
 *   - Left icon (colored blue tint background)
 *   - Right side: bold title / description with "Learn More" link
 *     in body / optional supplementary content (URL, payment gateway
 *     logos, etc.) / pair of action buttons: primary "Configure" or
 *     "Set up" + secondary "Watch & Learn" (play icon)
 *
 * Watch & Learn shows a tooltip "Tutorial coming soon" when clicked
 * since we don't have a video library yet.
 */
export function FeatureCard({
  icon: Icon,
  title,
  description,
  learnMoreHref,
  configureHref,
  configureLabel = "Configure",
  primary,
  extra,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  learnMoreHref?: string;
  configureHref: string;
  configureLabel?: string;
  /** True if this is the highlighted "next step" — adds a primary
   *  blue border like Zoho's active card. */
  primary?: boolean;
  /** Optional extra row between description and buttons (e.g.
   *  Portal URL or payment gateway logos). */
  extra?: React.ReactNode;
}) {
  const [showTooltip, setShowTooltip] = React.useState(false);

  return (
    <div
      className={cn(
        "rounded-lg border bg-background p-5 flex gap-4 hover:shadow-sm transition",
        primary ? "border-primary ring-1 ring-primary/20" : "border-input"
      )}
    >
      <div className="shrink-0">
        <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center">
          <Icon className="h-5 w-5 text-blue-600" />
        </div>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <h3 className="font-semibold text-base leading-tight">{title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {description}{" "}
          {learnMoreHref ? (
            <Link
              href={learnMoreHref}
              className="text-primary hover:underline whitespace-nowrap"
            >
              Learn More
            </Link>
          ) : null}
        </p>
        {extra ? <div className="pt-1">{extra}</div> : null}
        <div className="flex items-center gap-3 pt-3">
          <Button asChild size="sm" variant={primary ? "default" : "secondary"}>
            <Link href={configureHref}>{configureLabel}</Link>
          </Button>
          <div className="relative">
            <button
              type="button"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              onFocus={() => setShowTooltip(true)}
              onBlur={() => setShowTooltip(false)}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <PlayCircle className="h-4 w-4" />
              Watch &amp; Learn
            </button>
            {showTooltip ? (
              <div className="absolute left-0 top-full mt-1 z-10 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                Tutorial videos coming soon
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
