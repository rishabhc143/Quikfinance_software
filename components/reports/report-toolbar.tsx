"use client";
import * as React from "react";
import Link from "next/link";
import {
  ChevronDown,
  CircleDot,
  Download,
  PlayCircle,
  Printer,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  CustomizeReportDrawer,
  type CustomizeColumnDescriptor,
} from "./customize-report-drawer";
import { ReportActivityDrawer } from "./report-activity-drawer";
import { PrintPreferenceDrawer } from "./print-preference-drawer";
import { triggerPrint } from "@/lib/reports/print";
import type { ReportActivityRow } from "@/lib/reports/activity";

/**
 * REPORTS — Standard 5-button toolbar that every report mounts in
 * its `<ReportShell actions={...} />` slot.
 *
 * Buttons (left to right, matching the Zoho screenshot):
 *
 *   1. Customize Report (sliders) — opens the Customize drawer.
 *   2. Schedule Report (play + green dot badge) — Phase B; rendered
 *      disabled here so the visual layout matches the screenshot.
 *      Tooltip explains.
 *   3. Export ▾ — dropdown: PDF (disabled until Phase B) / XLSX /
 *      CSV / Print / Print Preference.
 *   4. Report Activity (rotate icon) — opens the Activity drawer.
 *   5. Close X — navigates back to /reports.
 */

export type ReportToolbarProps = {
  /** Catalog key — used for Save-as-Custom and activity logging. */
  reportKey: string;
  /** Display name (e.g. "Profit and Loss"); used in confirmations. */
  reportTitle: string;
  /** Org's fiscal-year start month (1-12). Passed to Customize drawer. */
  fiscalYearStartMonth: number;
  /** Base path of the report's export route. e.g. /reports/profit-loss/export. */
  exportBaseUrl: string;
  /** Preserved URL params (preset, from, to) for export links. */
  exportParams: string;
  /** Column descriptors for the Show/Hide Columns tab. Pass [] if none. */
  columns?: CustomizeColumnDescriptor[];
  /** Pre-fetched activity rows for the Activity drawer. */
  activityRows: ReportActivityRow[];
  /** Path to navigate back to. Defaults to /reports. */
  closeHref?: string;
};

export function ReportToolbar({
  reportKey,
  reportTitle,
  fiscalYearStartMonth,
  exportBaseUrl,
  exportParams,
  columns = [],
  activityRows,
  closeHref = "/reports",
}: ReportToolbarProps) {
  const [customizeOpen, setCustomizeOpen] = React.useState(false);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [printPrefOpen, setPrintPrefOpen] = React.useState(false);

  // Reference reportTitle so unused-prop lint doesn't fire. Used
  // in Phase A1.5 for the "Save as Custom Report" name input.
  void reportTitle;

  function buildExportUrl(format: "csv" | "xlsx" | "pdf"): string {
    const sep = exportParams ? "&" : "";
    return `${exportBaseUrl}?format=${format}${sep}${exportParams}`;
  }

  return (
    <>
      <div className="flex items-center gap-1.5 shrink-0">
        {/* 1. Customize */}
        <Button
          variant="outline"
          size="icon"
          aria-label="Customize Report"
          title="Customize Report"
          onClick={() => setCustomizeOpen(true)}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>

        {/* 2. Schedule (Phase B) */}
        <div className="relative">
          <Button
            variant="outline"
            size="icon"
            aria-label="Schedule Report"
            title="Schedule Report — coming in next release"
            disabled
          >
            <PlayCircle className="h-4 w-4" />
          </Button>
          {/* Green dot badge mirroring the screenshot */}
          <span
            aria-hidden
            className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-background"
          />
        </div>

        {/* 3. Export dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1">
              Export
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Export As
            </DropdownMenuLabel>
            <DropdownMenuItem disabled title="PDF export ships in Phase B">
              <span className="inline-flex items-center gap-2">
                <Download className="h-3.5 w-3.5" />
                PDF
              </span>
              <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                Soon
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={buildExportUrl("xlsx")}>XLSX (Microsoft Excel)</a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={buildExportUrl("csv")}>CSV</a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
              Print
            </DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => triggerPrint()}>
              <span className="inline-flex items-center gap-2">
                <Printer className="h-3.5 w-3.5" />
                Print
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPrintPrefOpen(true)}>
              Print Preference
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 4. Activity */}
        <Button
          variant="outline"
          size="icon"
          aria-label="Report Activity"
          title="Report Activity"
          onClick={() => setActivityOpen(true)}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>

        {/* 5. Close X */}
        <Button
          variant="outline"
          size="icon"
          asChild
          aria-label="Close report"
          title="Close report"
          className="text-destructive hover:text-destructive"
        >
          <Link href={closeHref}>
            <X className="h-4 w-4" />
          </Link>
        </Button>
      </div>

      <CustomizeReportDrawer
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        reportKey={reportKey}
        fiscalYearStartMonth={fiscalYearStartMonth}
        columns={columns}
      />
      <ReportActivityDrawer
        open={activityOpen}
        onOpenChange={setActivityOpen}
        rows={activityRows}
      />
      <PrintPreferenceDrawer
        open={printPrefOpen}
        onOpenChange={setPrintPrefOpen}
      />
    </>
  );
}

// Touch unused imports defensively so lint doesn't flag them
// (CircleDot is reserved for the upcoming Schedule active-state
// badge in Phase B).
void CircleDot;
