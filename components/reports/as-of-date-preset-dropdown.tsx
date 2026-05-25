"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AS_OF_PRESET_ORDER,
  AS_OF_PRESET_LABEL,
  resolveAsOfPreset,
  formatAsOfYmd,
  type AsOfPresetKey,
} from "@/lib/reports/as-of-date-presets";

/**
 * REPORTS-INFRA — Zoho-style "As of Date" preset dropdown.
 *
 * Drop-in for any report that has a single `?asOf=YYYY-MM-DD` filter.
 * Renders a two-part pill (left "As of Date" label, right value chip)
 * matching Zoho's filter strip layout, with an 11-option preset menu:
 *
 *   Today / This Week / This Month / This Quarter / This Year /
 *   Yesterday / Previous Week / Previous Month / Previous Quarter /
 *   Previous Year / Custom
 *
 * Picking a non-custom preset pushes `?asOfPreset=<key>&asOf=<date>`.
 * Picking Custom reveals an inline date input — changing the date
 * pushes `?asOfPreset=custom&asOf=<YYYY-MM-DD>`.
 *
 * Also renders hidden `<input name="asOf">` + `<input name="asOfPreset">`
 * so the parent `ReportFilterStrip` <form> picks them up on Run Report
 * submit (preserving the preset across navigation even when only the
 * date input changed).
 *
 *   <AsOfDatePresetDropdown
 *     defaultPreset={asOfPreset}
 *     defaultAsOf={asOf}
 *     fiscalYearStartMonth={organization.fiscalYearStart}
 *   />
 */
export function AsOfDatePresetDropdown({
  defaultPreset,
  defaultAsOf,
  fiscalYearStartMonth = 1,
}: {
  defaultPreset: AsOfPresetKey;
  defaultAsOf: Date;
  fiscalYearStartMonth?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Close the popover when the user clicks outside the component.
  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(key: AsOfPresetKey) {
    setOpen(false);
    const params = new URLSearchParams(search?.toString() ?? "");
    params.set("asOfPreset", key);
    if (key === "custom") {
      // Don't navigate yet — keep the current asOf and let the inline
      // date input drive the next push when the user changes it.
      params.set("asOf", formatAsOfYmd(defaultAsOf));
    } else {
      const resolvedDate = resolveAsOfPreset(key, fiscalYearStartMonth);
      params.set("asOf", formatAsOfYmd(resolvedDate));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function onCustomDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
    const params = new URLSearchParams(search?.toString() ?? "");
    params.set("asOfPreset", "custom");
    params.set("asOf", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  const isCustom = defaultPreset === "custom";

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-2">
      {/* Hidden inputs are what ReportFilterStrip's <form> picks up
          when the user clicks "Run Report". They keep the preset
          selection sticky across navigation even if only the date
          input changed. */}
      <input
        type="hidden"
        name="asOf"
        value={formatAsOfYmd(defaultAsOf)}
      />
      <input
        type="hidden"
        name="asOfPreset"
        value={defaultPreset}
      />

      {/* Two-part pill matching Zoho's screenshot:
          [📅 As of Date ▾]  :  [This Year ▾] */}
      <div className="inline-flex items-stretch rounded-md border border-input bg-background text-sm overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 h-9 text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>As of Date</span>
        </div>
        <span className="flex items-center px-1 text-muted-foreground border-l border-input">
          :
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 px-3 h-9 font-medium",
            "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
          )}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span>{AS_OF_PRESET_LABEL[defaultPreset]}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>

      {/* Custom date input — shown inline when preset is "custom" so
          the user can pick a specific date. Mirrors Zoho's "Custom"
          option which expands to an inline picker. */}
      {isCustom ? (
        <input
          type="date"
          defaultValue={formatAsOfYmd(defaultAsOf)}
          onChange={onCustomDateChange}
          className="h-9 px-2 rounded-md border border-input bg-background text-sm"
          aria-label="Custom as-of date"
        />
      ) : null}

      {/* Preset dropdown popover */}
      {open ? (
        <div
          className="absolute z-30 left-0 top-full mt-1 min-w-[200px] rounded-md border bg-popover p-1 shadow-md"
          role="menu"
        >
          {AS_OF_PRESET_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => pick(key)}
              className={cn(
                "block w-full text-left rounded-sm px-2.5 py-1.5 text-sm",
                defaultPreset === key
                  ? "bg-accent text-accent-foreground font-medium"
                  : "hover:bg-muted/60"
              )}
              role="menuitem"
            >
              {AS_OF_PRESET_LABEL[key]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
