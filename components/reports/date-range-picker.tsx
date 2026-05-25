"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  REPORT_PRESETS_ORDERED,
  PRESET_LABEL,
  resolvePreset,
  formatRangeLabel,
  rangeToSearchParams,
  type ReportPreset,
  type DateRange,
} from "@/lib/reports/date-range";

/**
 * REPORTS-INFRA — Date-range picker for the report shell.
 *
 *   - Trigger button shows the active preset's label + the
 *     resolved range underneath (e.g., "This Fiscal Year" /
 *     "Apr 01, 2026 — Mar 31, 2027").
 *   - Dropdown lists the 12 named presets + a Custom item.
 *   - Choosing Custom reveals two <input type="date"> fields
 *     in a popover so the user can pick from/to manually.
 *   - Any change pushes the new `?preset=…` (and `&from=…&to=…`
 *     for custom) to the URL so the server component re-fetches.
 *
 * Drop-in API:
 *
 *   <DateRangePicker
 *     activePreset={preset}
 *     activeRange={range}
 *     fiscalYearStartMonth={organization.fiscalYearStart}
 *   />
 *
 * The server resolves the URL via
 * `parseRangeFromSearchParams(searchParams, { fiscalYearStartMonth })`
 * from `lib/reports/date-range`.
 */
export function DateRangePicker({
  activePreset,
  activeRange,
  fiscalYearStartMonth = 1,
}: {
  activePreset: ReportPreset;
  activeRange: DateRange;
  fiscalYearStartMonth?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [customOpen, setCustomOpen] = React.useState(false);
  const [customFrom, setCustomFrom] = React.useState(
    iso(activeRange.start)
  );
  const [customTo, setCustomTo] = React.useState(iso(activeRange.end));

  function pickPreset(p: ReportPreset) {
    if (p === "custom") {
      // Open the custom panel inline rather than navigating.
      setCustomFrom(iso(activeRange.start));
      setCustomTo(iso(activeRange.end));
      setCustomOpen(true);
      return;
    }
    const resolved = resolvePreset(p, new Date(), fiscalYearStartMonth);
    if (!resolved) return;
    pushTo(p, resolved);
  }

  function applyCustom() {
    const f = parseIso(customFrom);
    const t = parseIso(customTo);
    if (!f || !t) return;
    if (f.getTime() > t.getTime()) return; // ignore inverted ranges
    pushTo("custom", { start: f, end: t });
    setCustomOpen(false);
  }

  function pushTo(p: ReportPreset, r: DateRange) {
    // Preserve any non-date query params the report cares about.
    const next = new URLSearchParams(search?.toString() ?? "");
    next.delete("preset");
    next.delete("from");
    next.delete("to");
    const qs = rangeToSearchParams(p, r);
    for (const [k, v] of qs.entries()) next.set(k, v);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Trigger pill matches the AsOfDatePresetDropdown's two-part
              shape: [📅 Date Range] : [<preset> ▾]. Resolved range
              displayed below for sanity-check. */}
          <Button
            variant="outline"
            className="h-auto p-0 flex flex-col items-stretch gap-0 overflow-hidden"
          >
            <div className="flex items-stretch text-sm">
              <div className="flex items-center gap-1.5 px-3 h-9 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>Date Range</span>
              </div>
              <span className="flex items-center px-1 text-muted-foreground border-l border-input">
                :
              </span>
              <div className="inline-flex items-center gap-1.5 px-3 h-9 font-medium">
                <span>{PRESET_LABEL[activePreset]}</span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </div>
            <div className="px-3 pb-1.5 text-[11px] text-muted-foreground tabular-nums text-left border-t border-input bg-muted/20">
              {formatRangeLabel(activeRange)}
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {REPORT_PRESETS_ORDERED.map((p, idx) =>
            p === null ? (
              <DropdownMenuSeparator key={`sep-${idx}`} />
            ) : (
              <DropdownMenuItem
                key={p}
                onClick={() => pickPreset(p)}
                className={cn(
                  activePreset === p && "bg-primary/10 text-primary font-medium"
                )}
              >
                {p === "custom" ? `${PRESET_LABEL[p]}…` : PRESET_LABEL[p]}
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {customOpen ? (
        <div className="flex items-end gap-2 rounded-md border bg-background p-2 shadow-sm">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              From
            </Label>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-8 w-36 text-xs"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
              To
            </Label>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-8 w-36 text-xs"
            />
          </div>
          <Button size="sm" onClick={applyCustom}>
            Apply
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCustomOpen(false)}
          >
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function iso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseIso(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  return new Date(Date.UTC(y, mo, d, 0, 0, 0, 0));
}
