"use client";
import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, Filter, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * REPORTS — Zoho-style aligned filter strip.
 *
 * Layout (from screenshot):
 *
 *   [⚙ Filters :]  [As of : Today ▾]  [Report Basis : Accrual ▾]
 *                  [+ More Filters]                    [Run Report ▾]
 *
 * Wrapper component that takes the per-report filter pills as
 * children, then renders the "+ More Filters" disabled stub and the
 * primary "Run Report" button on the right.
 *
 *   <ReportFilterStrip>
 *     <ReportFilterPill label="As of">{...}</ReportFilterPill>
 *     <ReportBasisDropdown />
 *   </ReportFilterStrip>
 */
export function ReportFilterStrip({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function reRunReport() {
    // "Run Report" just re-applies the current URL state by
    // pushing the same pathname + params. Useful when the user
    // changed something in a child pill and wants to refresh.
    router.push(`${pathname}?${searchParams?.toString() ?? ""}`);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap py-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
        <Filter className="h-3.5 w-3.5" />
        <span className="uppercase tracking-wider">Filters :</span>
      </div>

      {children}

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled
        title="More filters — coming soon"
        className="gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        More Filters
      </Button>

      <div className="ml-auto inline-flex">
        <Button
          type="button"
          size="sm"
          className="rounded-r-none border-r border-primary-foreground/20"
          onClick={reRunReport}
        >
          Run Report
        </Button>
        <Button
          type="button"
          size="sm"
          className="rounded-l-none px-2"
          onClick={reRunReport}
          aria-label="Run Report options"
          title="Run Report"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
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
