"use client";
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * REPORTS — Reusable right-side slide-in drawer.
 *
 * Powers the Customize Report, Schedule Report (Phase B), Report
 * Activity, and Print Preference panels on every report page. Built
 * on Radix Dialog so it inherits ESC-to-close, focus-trapping, and
 * aria-modal handling.
 *
 * Layout matches the reference's drawers:
 *  - Slides in from the right edge
 *  - Full-width on mobile, fixed 420px (or 720px for Customize) on
 *    desktop
 *  - Sticky header (title + close X), scrollable body, sticky footer
 *    (action buttons) supplied by the caller
 *
 * The toolbar (Customize / Schedule / Activity buttons) owns the open
 * state and renders this with the right children. Animation respects
 * `data-[state=open|closed]` so reduced-motion users get an instant
 * pop instead of a 250ms slide.
 */

export type ReportSideDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  /** "narrow" = 420px (Activity / Schedule), "wide" = 720px (Customize). */
  width?: "narrow" | "wide";
  /** Optional inline element rendered to the right of the title (e.g. status badge). */
  titleAccessory?: React.ReactNode;
  /** Sticky footer content. Typically Run/Save/Cancel buttons. */
  footer?: React.ReactNode;
  children: React.ReactNode;
};

export function ReportSideDrawer({
  open,
  onOpenChange,
  title,
  titleAccessory,
  width = "narrow",
  footer,
  children,
}: ReportSideDrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "fixed right-0 top-0 z-50 h-full w-full bg-background shadow-xl",
            "flex flex-col",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
            "duration-200",
            width === "wide" ? "sm:max-w-[720px]" : "sm:max-w-[420px]"
          )}
        >
          {/* Sticky header */}
          <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5 shrink-0">
            <DialogPrimitive.Title className="text-base font-semibold leading-none flex items-center gap-2">
              {title}
              {titleAccessory}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-destructive/30"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto">{children}</div>

          {/* Sticky footer */}
          {footer ? (
            <div className="border-t px-5 py-3 shrink-0 flex items-center gap-2 bg-background">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
