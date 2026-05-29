import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Single source of truth for status pills (Paid / Overdue / Pending /
 * Draft / Info, etc.) across every module. Backed by semantic Tailwind
 * tokens (`success` / `warning` / `info`) defined in
 * tailwind.config.ts → app/globals.css, so a future palette swap is
 * one CSS-variable change.
 *
 * Existing pills in the codebase still use ad-hoc `bg-amber-50
 * text-amber-700` flavors; those get swept to `<StatusPill>` in
 * follow-up PRs. Don't refactor them in the brand-refresh PR — keep
 * the diff small and the rollout reviewable.
 */
export type StatusVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

const VARIANT_CLASS: Record<StatusVariant, string> = {
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/15 text-warning-foreground border-warning/30",
  danger: "bg-destructive/10 text-destructive border-destructive/20",
  info: "bg-info/10 text-info border-info/20",
  neutral: "bg-muted text-muted-foreground border-border",
};

export type StatusPillProps = {
  variant?: StatusVariant;
  className?: string;
  children: React.ReactNode;
};

export function StatusPill({
  variant = "neutral",
  className,
  children,
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        VARIANT_CLASS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
