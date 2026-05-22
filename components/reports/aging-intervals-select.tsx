"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

/**
 * RPT-AR-DETAILS — Aging Intervals dropdown (client). Submitting on
 * change so users don't need a separate "Apply" click. Other filters
 * in the URL are preserved.
 */
const PRESETS: Array<{ label: string; count: number; size: number }> = [
  { label: "4 × 15 Days", count: 4, size: 15 },
  { label: "4 × 30 Days", count: 4, size: 30 },
  { label: "3 × 30 Days", count: 3, size: 30 },
  { label: "6 × 30 Days", count: 6, size: 30 },
];

export function AgingIntervalsSelect({
  intervalCount,
  intervalSize,
}: {
  intervalCount: number;
  intervalSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const value = `${intervalCount}x${intervalSize}`;

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    const [c, s] = v.split("x");
    const params = new URLSearchParams(searchParams);
    params.set("intervalCount", c);
    params.set("intervalSize", s);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Aging Intervals:</span>
      <select
        value={value}
        onChange={onChange}
        disabled={pending}
        className="h-7 px-1.5 rounded-md border bg-background text-xs disabled:opacity-50"
      >
        {PRESETS.map((p) => (
          <option key={p.label} value={`${p.count}x${p.size}`}>
            {p.label}
          </option>
        ))}
      </select>
    </span>
  );
}
