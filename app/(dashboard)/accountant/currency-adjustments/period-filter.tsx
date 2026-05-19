"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

export type Period =
  | "this-month"
  | "last-month"
  | "this-quarter"
  | "last-quarter"
  | "this-year"
  | "last-year"
  | "all-time";

const LABELS: Record<Period, string> = {
  "this-month": "This Month",
  "last-month": "Last Month",
  "this-quarter": "This Quarter",
  "last-quarter": "Last Quarter",
  "this-year": "This Year",
  "last-year": "Last Year",
  "all-time": "All Time",
};

/**
 * ACCT-C.3 — "Filter By: ▾" pill on the Base Currency Adjustments
 * list. Matches the reference pill; pushes `?period=` to the URL so the
 * server component re-fetches scoped to the new range.
 */
export function PeriodFilter({ current }: { current: Period }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function go(p: Period) {
    const next = new URLSearchParams(search?.toString() ?? "");
    if (p === "this-month") next.delete("period");
    else next.set("period", p);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border bg-background text-xs hover:bg-muted/40">
        <span className="text-muted-foreground">Filter By:</span>
        <span className="font-medium">{LABELS[current]}</span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {(Object.keys(LABELS) as Period[]).map((p) => (
          <DropdownMenuItem key={p} onClick={() => go(p)}>
            {LABELS[p]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
