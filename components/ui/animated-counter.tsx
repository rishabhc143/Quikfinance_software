"use client";

import * as React from "react";
import { formatMoney } from "@/lib/money";

/**
 * Counts up from the previous value to `value` over `durationMs` using
 * requestAnimationFrame + an ease-out curve. Formatting is done inside
 * this client component from primitive props (currency / decimals) — we
 * intentionally don't accept a `format` function because Next.js Server
 * Components can't pass functions to Client Components, and this
 * component is rendered from server pages (the dashboard home).
 *
 *   <AnimatedCounter value={123456.78} currency="INR" />
 *   <AnimatedCounter value={42} decimals={0} />
 *
 * Honours `prefers-reduced-motion` — snaps to the final value instead
 * of animating when the user has the OS preference set.
 */
export function AnimatedCounter({
  value,
  currency,
  decimals,
  durationMs = 900,
  className,
}: {
  value: number;
  /** When set, output is formatted with formatMoney(value, currency). */
  currency?: string;
  /** When set (and currency is not), output is rendered as a number
   *  with this many fraction digits. Default: 0. */
  decimals?: number;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = React.useState(value);
  const fromRef = React.useRef(value);
  const startRef = React.useRef<number | null>(null);
  const targetRef = React.useRef(value);

  React.useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setDisplay(value);
      fromRef.current = value;
      targetRef.current = value;
      return;
    }

    fromRef.current = display;
    targetRef.current = value;
    startRef.current = null;
    let raf = 0;

    const step = (now: number) => {
      if (startRef.current == null) startRef.current = now;
      const t = Math.min(1, (now - startRef.current) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = fromRef.current + (targetRef.current - fromRef.current) * eased;
      setDisplay(current);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // We read `display` once when starting a new tween, but we don't
    // want every intermediate frame to retrigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  const text = currency
    ? formatMoney(display, currency)
    : Math.round(display).toLocaleString("en-IN", {
        maximumFractionDigits: decimals ?? 0,
      });

  return <span className={className}>{text}</span>;
}
