"use client";

import * as React from "react";

/**
 * Counts up from 0 (or the previous value) to `value` over `durationMs`
 * using requestAnimationFrame + an ease-out curve. The displayed string is
 * produced by `format(currentNumber)` so callers control thousand-grouping,
 * currency symbol, decimals, etc. without this component knowing about
 * locale.
 *
 * Used by the dashboard home to make the big money numbers feel "alive"
 * on first paint — a Stripe Dashboard / Linear visual cue. Pure React,
 * no dependencies.
 */
export function AnimatedCounter({
  value,
  format,
  durationMs = 900,
  className,
}: {
  value: number;
  format: (n: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = React.useState(value);
  const fromRef = React.useRef(value);
  const startRef = React.useRef<number | null>(null);
  const targetRef = React.useRef(value);

  React.useEffect(() => {
    // If the user prefers reduced motion, snap to the final value.
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
      // ease-out cubic: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - t, 3);
      const current = fromRef.current + (targetRef.current - fromRef.current) * eased;
      setDisplay(current);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // We intentionally exclude `display` from deps — we read the current
    // displayed value when starting a new tween, but we don't want every
    // intermediate frame to retrigger the effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, durationMs]);

  return <span className={className}>{format(display)}</span>;
}
