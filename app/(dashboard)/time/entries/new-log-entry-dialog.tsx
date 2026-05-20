"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HelpCircle, Timer } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTimeEntryAction } from "./actions";

type TaskOption = { id: string; name: string; billable: boolean };
type ProjectOption = { id: string; name: string; tasks: TaskOption[] };
type UserOption = { id: string; name: string; email: string };

/**
 * NewLogEntryDialog — Zoho-style modal that opens from the timesheet
 * toolbar's "+ New Log Entry" primary action. Mirrors the reference
 * screenshot field-for-field:
 *
 *   Date* / Project Name* / Task Name* / Time Spent* (HH:MM)
 *   ↳ "Set start and end time instead" link toggles to two time inputs
 *   Billable / User* / Notes
 *   Save · Start Timer · Cancel
 *
 * Reuses the existing createTimeEntryAction. Time-Spent is parsed from
 * HH:MM to fractional hours before being submitted.
 */
export function NewLogEntryDialog({
  projects,
  members,
  currentUser,
  trigger,
}: {
  projects: ProjectOption[];
  members: UserOption[];
  currentUser: UserOption;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const todayIso = React.useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }, []);

  const [date, setDate] = React.useState(todayIso);
  const [projectId, setProjectId] = React.useState("");
  const [taskId, setTaskId] = React.useState("");
  const [timeMode, setTimeMode] = React.useState<"duration" | "range">("duration");
  const [timeSpent, setTimeSpent] = React.useState(""); // HH:MM
  const [startTime, setStartTime] = React.useState(""); // HH:MM 24h
  const [endTime, setEndTime] = React.useState("");
  const [billable, setBillable] = React.useState(true);
  const [userId, setUserId] = React.useState(currentUser.id);
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const taskOptions = selectedProject?.tasks ?? [];
  const projectHasNoTasks = selectedProject != null && taskOptions.length === 0;

  function onProjectChange(nextId: string) {
    setProjectId(nextId);
    const next = projects.find((p) => p.id === nextId);
    const firstTask = next?.tasks[0];
    if (firstTask) {
      setTaskId(firstTask.id);
      setBillable(firstTask.billable);
    } else {
      setTaskId("");
    }
  }

  function onTaskChange(nextTaskId: string) {
    setTaskId(nextTaskId);
    const t = taskOptions.find((tt) => tt.id === nextTaskId);
    if (t) setBillable(t.billable);
  }

  /** Parse "HH:MM" → fractional hours (e.g. "1:30" → 1.5). Returns null on invalid. */
  function parseHHMM(s: string): number | null {
    if (!s) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
    if (min < 0 || min > 59) return null;
    return h + min / 60;
  }

  /** Compute hours from start/end time. Assumes same day; if end < start we wrap +24h. */
  function hoursFromRange(start: string, end: string): number | null {
    const sh = parseHHMM(start);
    const eh = parseHHMM(end);
    if (sh === null || eh === null) return null;
    let diff = eh - sh;
    if (diff < 0) diff += 24;
    return diff;
  }

  function resolveHours(): number | null {
    if (timeMode === "duration") return parseHHMM(timeSpent);
    return hoursFromRange(startTime, endTime);
  }

  async function onSave() {
    if (!date) {
      toast.error("Date is required.");
      return;
    }
    if (!projectId) {
      toast.error("Project Name is required.");
      return;
    }
    if (!taskId) {
      toast.error("Task Name is required.");
      return;
    }
    const hours = resolveHours();
    if (hours === null || hours <= 0) {
      toast.error(
        timeMode === "duration"
          ? "Time Spent must be HH:MM (e.g. 1:30)"
          : "Start/end time invalid or end equals start"
      );
      return;
    }
    if (hours > 24) {
      toast.error("Time Spent can't exceed 24 hours.");
      return;
    }
    if (!userId) {
      toast.error("User is required.");
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("projectId", projectId);
      fd.set("taskId", taskId);
      fd.set("date", date);
      fd.set("hours", hours.toFixed(4));
      fd.set("description", notes.trim() || `Logged ${hours.toFixed(2)}h`);
      fd.set("billable", billable ? "true" : "false");
      await createTimeEntryAction(fd);
      toast.success(`Logged ${hours.toFixed(2)}h`);
      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't save entry";
      if (msg.includes("NEXT_REDIRECT")) {
        toast.success(`Logged ${hours.toFixed(2)}h`);
        setOpen(false);
        reset();
        return;
      }
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setProjectId("");
    setTaskId("");
    setTimeSpent("");
    setStartTime("");
    setEndTime("");
    setBillable(true);
    setUserId(currentUser.id);
    setNotes("");
    setDate(todayIso);
    setTimeMode("duration");
  }

  function onStartTimer() {
    // For v1 we surface a toast pointer; the Start Timer modal lives
    // separately on the toolbar and uses its own localStorage flow.
    toast.message("Use the Start button on the toolbar to begin a live timer.", {
      description: "We'll wire the cross-modal handoff in a follow-up.",
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? <Button className="bg-blue-600 hover:bg-blue-700">+ New Log Entry</Button>}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b shrink-0 bg-muted/20">
          <h2 className="text-base font-semibold">New Log Entry</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Log time instantly using shortcut keys{" "}
            <kbd className="px-1.5 py-0.5 rounded-sm bg-muted text-[10px] font-mono">
              c + t
            </kbd>
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Date */}
          <div>
            <Label className="text-destructive mb-1.5 block">Date*</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* Project Name */}
          <div>
            <Label className="text-destructive mb-1.5 block">Project Name*</Label>
            <select
              value={projectId}
              onChange={(e) => onProjectChange(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {projects.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                No projects yet.{" "}
                <Link href="/time/projects/new" className="text-blue-600 hover:text-blue-700">
                  Create one first
                </Link>
                .
              </p>
            )}
          </div>

          {/* Task Name */}
          <div>
            <Label className="text-destructive mb-1.5 block">Task Name*</Label>
            <select
              value={taskId}
              onChange={(e) => onTaskChange(e.target.value)}
              disabled={!selectedProject || projectHasNoTasks}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
            >
              <option value="">Select task</option>
              {taskOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {projectHasNoTasks && selectedProject && (
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                No tasks for this project.{" "}
                <Link
                  href={`/time/projects/${selectedProject.id}/tasks/new`}
                  className="text-blue-600 hover:text-blue-700"
                >
                  Add a task first
                </Link>
                .
              </p>
            )}
          </div>

          {/* Time Spent / Range */}
          <div>
            <Label className="text-destructive mb-1.5 flex items-center gap-1">
              Time Spent*
              <span
                title="Enter time as HH:MM. Use the link below to enter start and end times instead."
                className="text-muted-foreground"
              >
                <HelpCircle className="h-3.5 w-3.5" />
              </span>
            </Label>
            {timeMode === "duration" ? (
              <>
                <Input
                  type="text"
                  placeholder="HH:MM"
                  value={timeSpent}
                  onChange={(e) => setTimeSpent(e.target.value)}
                  inputMode="numeric"
                />
                <button
                  type="button"
                  onClick={() => setTimeMode("range")}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-1.5"
                >
                  <Timer className="h-3 w-3" />
                  Set start and end time instead
                </button>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Start
                    </Label>
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      End
                    </Label>
                    <Input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTimeMode("duration")}
                  className="text-xs text-blue-600 hover:text-blue-700 mt-1.5"
                >
                  Set duration instead
                </button>
              </>
            )}
          </div>

          {/* Billable */}
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={billable}
              onChange={(e) => setBillable(e.target.checked)}
              className="h-4 w-4 rounded border-input text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm">Billable</span>
          </label>

          {/* User */}
          <div>
            <Label className="text-destructive mb-1.5 block">User*</Label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">Select user</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <Label className="mb-1.5 block">Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes"
              rows={3}
              maxLength={500}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center gap-2 shrink-0">
          <Button
            onClick={onSave}
            disabled={busy}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button onClick={onStartTimer} variant="outline" disabled={busy}>
            Start Timer
          </Button>
          <Button onClick={() => setOpen(false)} variant="outline" disabled={busy}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
