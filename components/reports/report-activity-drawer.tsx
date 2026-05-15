"use client";
import * as React from "react";
import {
  CalendarPlus,
  CalendarClock,
  CalendarX,
  Circle,
  FileSpreadsheet,
  FileText,
  FileType,
  PauseCircle,
  Printer,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import { format } from "date-fns";
import { ReportSideDrawer } from "./report-side-drawer";
import {
  formatReportActivityMessage,
  iconNameForEvent,
  type ReportActivityRow,
} from "@/lib/reports/activity";

/**
 * REPORTS — Report Activity drawer.
 *
 * Server fetches the timeline rows (via `getRecentReportActivity` in
 * lib/reports/activity.ts) and passes them in as a prop. This client
 * just renders the vertical timeline matching Zoho's screenshot:
 *
 *   • icon · user.displayName · createdAt
 *   • bubble with the human message ("PDF generated for the …")
 *
 * When the list is empty we show the same friendly empty state as
 * Zoho — folder icon + "View the upcoming logs of your Scheduled
 * Reports". (Identical copy is fine — it's a generic empty state,
 * not an integration claim.)
 */

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  FileSpreadsheet,
  FileType,
  Printer,
  SlidersHorizontal,
  CalendarPlus,
  CalendarClock,
  PauseCircle,
  CalendarX,
  Send,
  Circle,
};

export type ReportActivityDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-fetched rows from the server (`getRecentReportActivity`). */
  rows: ReportActivityRow[];
};

export function ReportActivityDrawer({
  open,
  onOpenChange,
  rows,
}: ReportActivityDrawerProps) {
  return (
    <ReportSideDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Report Activity"
      width="narrow"
    >
      {rows.length === 0 ? <EmptyState /> : <Timeline rows={rows} />}
    </ReportSideDrawer>
  );
}

function Timeline({ rows }: { rows: ReportActivityRow[] }) {
  return (
    <ol className="p-5 space-y-5">
      {rows.map((r, idx) => {
        const Icon = ICON_MAP[iconNameForEvent(r.eventType)] ?? Circle;
        return (
          <li key={r.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="rounded-full border-2 border-primary/30 p-1.5 bg-background">
                <Icon className="h-3.5 w-3.5 text-primary" />
              </span>
              {idx < rows.length - 1 ? (
                <span className="w-px flex-1 bg-border mt-1" />
              ) : null}
            </div>
            <div className="flex-1 min-w-0 pb-2">
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <span className="font-medium">{r.userDisplayName}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {format(r.createdAt, "dd/MM/yyyy hh:mm a")}
                </span>
              </div>
              <div className="mt-1.5 text-sm bg-muted/40 rounded-md px-3 py-2 text-foreground/90">
                {formatReportActivityMessage(r)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 text-muted-foreground">
      <FolderIllustration />
      <p className="mt-6 text-sm max-w-[260px]">
        View the upcoming logs of your Scheduled Reports
      </p>
    </div>
  );
}

function FolderIllustration() {
  return (
    <svg
      width="120"
      height="90"
      viewBox="0 0 120 90"
      fill="none"
      aria-hidden
      className="text-muted-foreground/60"
    >
      <path
        d="M14 18a4 4 0 014-4h26l8 8h40a4 4 0 014 4v50a4 4 0 01-4 4H18a4 4 0 01-4-4V18z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="3 3"
        fill="white"
      />
      <rect
        x="34"
        y="32"
        width="48"
        height="34"
        rx="3"
        fill="#3b82f6"
        opacity="0.15"
      />
      <rect
        x="38"
        y="38"
        width="40"
        height="3"
        rx="1.5"
        fill="#3b82f6"
        opacity="0.5"
      />
      <rect
        x="38"
        y="45"
        width="28"
        height="3"
        rx="1.5"
        fill="#3b82f6"
        opacity="0.35"
      />
      <path d="M82 24l6 6-6 6V24z" fill="#fbbf24" />
    </svg>
  );
}
