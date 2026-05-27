"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BookmarkPlus,
  ChevronDown,
  CircleDot,
  Download,
  PlayCircle,
  Printer,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  ScheduleReportDrawer,
  type ExistingScheduleSummary,
} from "./schedule-report-drawer";
import { triggerPrint } from "@/lib/reports/print";
import type { ReportActivityRow } from "@/lib/reports/activity";
import { createCustomReportAction } from "@/app/(dashboard)/reports/actions";

/**
 * REPORTS — Standard 5-button toolbar that every report mounts in
 * its `<ReportShell actions={...} />` slot.
 *
 * Buttons (left to right, matching the reference screenshot):
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
  /** Pre-fetched existing schedule (if any) for this user+org+report. */
  existingSchedule?: ExistingScheduleSummary | null;
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
  existingSchedule = null,
  closeHref = "/reports",
}: ReportToolbarProps) {
  const [customizeOpen, setCustomizeOpen] = React.useState(false);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [activityOpen, setActivityOpen] = React.useState(false);
  const [printPrefOpen, setPrintPrefOpen] = React.useState(false);

  // "Save as Custom Report" dialog — names + persists the current
  // report view (its exportParams) under the user's "My Reports" tab.
  const router = useRouter();
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [saveName, setSaveName] = React.useState(reportTitle);
  const [savePending, startSaveTransition] = React.useTransition();

  // Reset the name input to the report title each time the dialog opens.
  React.useEffect(() => {
    if (saveOpen) setSaveName(reportTitle);
  }, [saveOpen, reportTitle]);

  function onSaveCustomReport() {
    const name = saveName.trim();
    if (!name) {
      toast.error("Please enter a name.");
      return;
    }
    startSaveTransition(async () => {
      const res = await createCustomReportAction({
        name,
        reportKey,
        params: exportParams,
      });
      if (res.ok) {
        toast.success("Custom report saved");
        setSaveOpen(false);
        router.push("/reports?tab=my");
      } else {
        toast.error(res.error ?? "Couldn't save custom report");
      }
    });
  }

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

        {/* 1b. Save as Custom Report */}
        <Button
          variant="outline"
          size="icon"
          aria-label="Save as Custom Report"
          title="Save as Custom Report"
          onClick={() => setSaveOpen(true)}
        >
          <BookmarkPlus className="h-4 w-4" />
        </Button>

        {/* 2. Schedule */}
        <div className="relative">
          <Button
            variant="outline"
            size="icon"
            aria-label="Schedule Report"
            title={
              existingSchedule
                ? `Scheduled — ${existingSchedule.status}`
                : "Schedule Report"
            }
            onClick={() => setScheduleOpen(true)}
          >
            <PlayCircle className="h-4 w-4" />
          </Button>
          {/* Green dot badge when an ACTIVE schedule exists */}
          {existingSchedule?.status === "ACTIVE" ? (
            <span
              aria-hidden
              className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-background"
            />
          ) : null}
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
            <DropdownMenuItem asChild>
              <a href={buildExportUrl("pdf")} className="inline-flex items-center gap-2">
                <Download className="h-3.5 w-3.5" />
                PDF
              </a>
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
      <ScheduleReportDrawer
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        reportKey={reportKey}
        reportTitle={reportTitle}
        existing={existingSchedule}
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

      {/* Save as Custom Report dialog */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save as Custom Report</DialogTitle>
            <DialogDescription>
              Save this report&apos;s current filters and columns under your
              My Reports tab. Reopen it any time to restore this view.
            </DialogDescription>
          </DialogHeader>
          <div className="py-1">
            <Input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Custom report name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !savePending) {
                  e.preventDefault();
                  onSaveCustomReport();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSaveOpen(false)}
              disabled={savePending}
            >
              Cancel
            </Button>
            <Button onClick={onSaveCustomReport} disabled={savePending}>
              {savePending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Touch unused imports defensively so lint doesn't flag them
// (CircleDot is reserved for the upcoming Schedule active-state
// badge in Phase B).
void CircleDot;
