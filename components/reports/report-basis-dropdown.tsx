"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
// Re-exported for back-compat with existing import sites; the actual
// definitions live in the server-safe lib so server pages can import
// them without crossing the "use client" boundary (which breaks
// non-component exports on prod — see lib/reports/report-basis.ts
// for the back-story).
import {
  REPORT_BASIS_LABEL,
  parseReportBasis,
  type ReportBasis,
} from "@/lib/reports/report-basis";

export { REPORT_BASIS_LABEL, parseReportBasis };
export type { ReportBasis };

/**
 * REPORTS — Report Basis pill-style dropdown.
 *
 * Two options: Accrual (default) and Cash. Selecting Cash currently
 * routes to the same accrual-basis data — a "Cash basis: coming
 * soon" hint surfaces on the report itself. URL persistence via
 * `?basis=accrual|cash` so the user's choice survives reload.
 *
 * Visual: matches the reference's filter-strip pill (rounded border, label +
 * value + caret). Sized to align with the date-range picker pill.
 */

export function ReportBasisDropdown({
  defaultBasis = "accrual",
}: {
  defaultBasis?: ReportBasis;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const current = (searchParams?.get("basis") as ReportBasis | null) ?? defaultBasis;

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(b: ReportBasis) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (b === "accrual") {
      params.delete("basis");
    } else {
      params.set("basis", b);
    }
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-input bg-background h-9 px-3 text-sm",
          "hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
        )}
      >
        <span className="text-muted-foreground">Report Basis :</span>
        <span className="font-medium">{REPORT_BASIS_LABEL[current]}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute z-30 mt-1 min-w-[180px] rounded-md border bg-popover p-1 shadow-md">
          {(Object.keys(REPORT_BASIS_LABEL) as ReportBasis[]).map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => pick(b)}
              className={cn(
                "block w-full text-left rounded-sm px-2.5 py-1.5 text-sm",
                current === b
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted/60"
              )}
            >
              {REPORT_BASIS_LABEL[b]}
              {b === "cash" ? (
                <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-600">
                  beta
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// parseReportBasis was inlined here historically. It now lives in
// lib/reports/report-basis.ts (server-safe) and is re-exported at
// the top of this file. Server pages should ideally import directly
// from the lib path to avoid pulling in this client component's
// React imports, but the re-export keeps existing call sites working.
