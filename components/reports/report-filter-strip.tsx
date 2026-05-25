"use client";
import * as React from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * REPORTS — aligned filter strip.
 *
 * Layout:
 *
 *   [⚙ Filters :]  [As of : Today ▾]  [Report Basis : Accrual ▾]
 *                                                       [Run Report ▾]
 *
 * Wrapper component that takes the per-report filter pills as
 * children, then renders the primary "Run Report" button on the right.
 *
 * Item #2.4 (PR #250) made the strip a `<form method="GET">`. The Run
 * Report button is now a real submit button — clicking it serialises
 * every `<input name="...">` rendered inside `{children}` and posts to
 * the current pathname. That makes Trial Balance's date picker (plain
 * server-rendered `<input>`) actually re-run the report. Client-side
 * controls like ReportBasisDropdown / DateRangePicker still
 * `router.push()` on change and remain orthogonal — submitting a form
 * with no inputs of theirs is a harmless refresh of the same URL.
 *
 *   <ReportFilterStrip>
 *     <ReportFilterPill label="As of">{...}</ReportFilterPill>
 *     <ReportBasisDropdown />
 *   </ReportFilterStrip>
 */
export function ReportFilterStrip({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <form
      method="GET"
      action={pathname ?? ""}
      className="flex items-center gap-2 flex-wrap py-1"
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
        <Filter className="h-3.5 w-3.5" />
        <span className="uppercase tracking-wider">Filters :</span>
      </div>

      {children}

      <div className="ml-auto inline-flex">
        <Button
          type="submit"
          size="sm"
          className="rounded-r-none border-r border-primary-foreground/20"
        >
          Run Report
        </Button>
        <Button
          type="submit"
          size="sm"
          className="rounded-l-none px-2"
          aria-label="Run Report options"
          title="Run Report"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </div>
    </form>
  );
}

/**
 * One pill inside the filter strip. Renders the gray label prefix
 * plus the child value (typically a button or input styled to look
 * pill-like).
 */
export function ReportFilterPill({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-input bg-background h-9 px-3 text-sm"
      )}
    >
      <span className="text-muted-foreground">{label} :</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}
