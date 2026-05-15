"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Calendar, FileText, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ReportSideDrawer } from "./report-side-drawer";
import {
  createScheduledReportAction,
  pauseScheduledReportAction,
  resumeScheduledReportAction,
  deleteScheduledReportAction,
} from "@/app/(dashboard)/reports/_actions/schedule";
import {
  FORMAT_LABEL,
  FREQUENCY_LABEL,
  type ScheduleFormat,
  type ScheduleFrequency,
} from "@/lib/reports/scheduled";

/**
 * REPORTS — Schedule Report drawer (Zoho-style).
 *
 * Two modes:
 *  • No existing schedule → renders the create form.
 *  • Existing schedule → renders the summary card matching
 *    Zoho's screenshot (Active badge, next-send timestamp,
 *    Schedule Details, Show Recipients, Schedule History tab).
 *
 * Form fields:
 *   Frequency        DAILY / WEEKLY / MONTHLY
 *   Format           PDF / XLSX / CSV
 *   Start Date       <input type="datetime-local">
 *   Recipients       textarea (comma/newline separated)
 *
 * Save click hits createScheduledReportAction, which logs a
 * SCHEDULE_CREATED activity and revalidates the report page.
 * The cron worker (app/api/cron/scheduled-reports/route.ts)
 * picks up the row on the next daily sweep.
 */

export type ExistingScheduleSummary = {
  id: string;
  frequency: ScheduleFrequency;
  format: ScheduleFormat;
  status: "ACTIVE" | "PAUSED";
  nextSendAt: Date;
  startDate: Date;
  recipients: string[];
};

export type ScheduleReportDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportKey: string;
  reportTitle: string;
  /** Pre-fetched existing schedule for this user+org+report, if any. */
  existing: ExistingScheduleSummary | null;
};

export function ScheduleReportDrawer(props: ScheduleReportDrawerProps) {
  return (
    <ReportSideDrawer
      open={props.open}
      onOpenChange={props.onOpenChange}
      title="Schedule Report"
      titleAccessory={
        props.existing ? (
          props.existing.status === "ACTIVE" ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              Active
            </Badge>
          ) : (
            <Badge variant="outline">Paused</Badge>
          )
        ) : null
      }
      width="narrow"
    >
      {props.existing ? (
        <ExistingScheduleView
          reportTitle={props.reportTitle}
          existing={props.existing}
          onClose={() => props.onOpenChange(false)}
        />
      ) : (
        <CreateScheduleForm
          reportKey={props.reportKey}
          reportTitle={props.reportTitle}
          onClose={() => props.onOpenChange(false)}
        />
      )}
    </ReportSideDrawer>
  );
}

function CreateScheduleForm({
  reportKey,
  reportTitle,
  onClose,
}: {
  reportKey: string;
  reportTitle: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [frequency, setFrequency] = React.useState<ScheduleFrequency>("WEEKLY");
  const [fmtVal, setFmtVal] = React.useState<ScheduleFormat>("PDF");
  const [startDate, setStartDate] = React.useState<string>(() => {
    // Default to next Monday 9am local time
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    d.setDate(d.getDate() + ((1 - d.getDay() + 7) % 7 || 7));
    return formatLocalDateTimeForInput(d);
  });
  const [recipients, setRecipients] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const result = await createScheduledReportAction({
      reportKey,
      reportTitle,
      frequency,
      format: fmtVal,
      startDate,
      recipients,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error ?? "Failed to create schedule");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="p-5 space-y-5 text-sm">
      <p className="text-muted-foreground">
        Email this report on a recurring schedule. The cron worker
        runs once a day; precise time-of-day depends on your Vercel
        plan&apos;s cron granularity.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="freq">Frequency</Label>
        <select
          id="freq"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as ScheduleFrequency)}
          className="w-full h-9 rounded-md border bg-background px-3"
        >
          {(["DAILY", "WEEKLY", "MONTHLY"] as ScheduleFrequency[]).map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABEL[f]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fmt">Format</Label>
        <select
          id="fmt"
          value={fmtVal}
          onChange={(e) => setFmtVal(e.target.value as ScheduleFormat)}
          className="w-full h-9 rounded-md border bg-background px-3"
        >
          {(["PDF", "XLSX", "CSV"] as ScheduleFormat[]).map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="start">Start Date &amp; Time</Label>
        <input
          id="start"
          type="datetime-local"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="w-full h-9 rounded-md border bg-background px-3"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="recipients">Recipients</Label>
        <textarea
          id="recipients"
          value={recipients}
          onChange={(e) => setRecipients(e.target.value)}
          placeholder="alice@example.com, bob@example.com"
          rows={3}
          className="w-full rounded-md border bg-background p-2 text-sm font-mono"
        />
        <p className="text-xs text-muted-foreground">
          Separate multiple emails with commas or newlines.
        </p>
      </div>

      {error ? (
        <div className="text-sm text-destructive border border-destructive/30 bg-destructive/5 rounded-md px-3 py-2">
          {error}
        </div>
      ) : null}

      <div className="flex items-center gap-2 pt-3">
        <Button size="sm" onClick={submit} disabled={submitting}>
          {submitting ? "Saving…" : "Save Schedule"}
        </Button>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground ml-auto px-2 py-1"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function ExistingScheduleView({
  reportTitle,
  existing,
  onClose,
}: {
  reportTitle: string;
  existing: ExistingScheduleSummary;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [showRecipients, setShowRecipients] = React.useState(false);
  void reportTitle;

  async function pause() {
    setBusy(true);
    await pauseScheduledReportAction(existing.id);
    setBusy(false);
    router.refresh();
  }
  async function resume() {
    setBusy(true);
    await resumeScheduledReportAction(existing.id);
    setBusy(false);
    router.refresh();
  }
  async function remove() {
    if (!confirm("Delete this scheduled report? Future emails won't be sent.")) return;
    setBusy(true);
    await deleteScheduledReportAction(existing.id);
    setBusy(false);
    onClose();
    router.refresh();
  }

  return (
    <div className="p-5 space-y-5 text-sm">
      {/* Next-send banner */}
      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 rounded-md p-3 flex items-start gap-3">
        <span className="rounded-md bg-background p-1.5 border">
          <Calendar className="h-4 w-4 text-blue-600" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-foreground">
            The next scheduled report will be sent on{" "}
            <span className="font-medium">
              {format(existing.nextSendAt, "dd/MM/yyyy hh:mm a")}
            </span>
          </div>
          <button
            type="button"
            onClick={existing.status === "ACTIVE" ? pause : resume}
            disabled={busy}
            className="text-blue-600 hover:underline text-sm mt-1"
          >
            {existing.status === "ACTIVE" ? "Pause Scheduler" : "Resume Scheduler"}
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold">Schedule Details</h3>
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </div>
        <dl className="text-sm space-y-2">
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <dt className="text-muted-foreground">Frequency</dt>
            <dd>{FREQUENCY_LABEL[existing.frequency]}</dd>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <dt className="text-muted-foreground">Start Date</dt>
            <dd className="tabular-nums">
              {format(existing.startDate, "dd/MM/yyyy hh:mm a")}
            </dd>
          </div>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <dt className="text-muted-foreground">Format</dt>
            <dd className="flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-red-500" />
              {existing.format}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          onClick={() => setShowRecipients((v) => !v)}
          className="text-blue-600 hover:underline text-sm mt-3"
        >
          {showRecipients ? "Hide Recipients ›" : "Show Recipients ›"}
        </button>
        {showRecipients ? (
          <ul className="mt-2 text-sm space-y-0.5 pl-4 list-disc text-muted-foreground">
            {existing.recipients.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="pt-3 border-t flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={remove}
          disabled={busy}
          className="text-destructive hover:text-destructive"
        >
          Delete Schedule
        </Button>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-muted-foreground hover:text-foreground ml-auto px-2 py-1"
        >
          Close
        </button>
      </div>
    </div>
  );
}

/** Format a Date as `yyyy-MM-ddTHH:mm` in local time for datetime-local input. */
function formatLocalDateTimeForInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
