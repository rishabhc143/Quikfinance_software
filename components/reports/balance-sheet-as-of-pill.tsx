"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar } from "lucide-react";
import { format, parse } from "date-fns";

/**
 * REPORTS — "As of" date pill for the Balance Sheet filter strip.
 *
 * Matches the Zoho-style pill: gray "As of :" label + the current
 * date or a preset name + a calendar icon. Native <input type="date">
 * powers the picker; changes push `?as_of=YYYY-MM-DD` to the URL.
 */
export function BalanceSheetAsOfPill({
  defaultValue,
}: {
  defaultValue: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams?.get("as_of") ?? defaultValue;

  function pick(newDate: string) {
    if (!newDate) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("as_of", newDate);
    router.push(`${pathname}?${params.toString()}`);
  }

  // Compute a friendly label — "Today" / "Yesterday" / "<dd MMM>"
  const displayLabel = friendlyAsOfLabel(value);

  return (
    <div className="relative inline-flex items-center gap-1.5 rounded-md border border-input bg-background h-9 px-3 text-sm hover:bg-muted/50">
      <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">As of :</span>
      <span className="font-medium">{displayLabel}</span>
      {/* Date input layered on top — invisible but receives clicks and
          opens the native picker on focus. */}
      <input
        type="date"
        value={value}
        onChange={(e) => pick(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer"
        aria-label="As of date"
      />
    </div>
  );
}

function friendlyAsOfLabel(yyyyMmDd: string): string {
  try {
    const d = parse(yyyyMmDd, "yyyy-MM-dd", new Date());
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === -1) return "Yesterday";
    if (diffDays === 1) return "Tomorrow";
    return format(d, "dd MMM yyyy");
  } catch {
    return yyyyMmDd;
  }
}
