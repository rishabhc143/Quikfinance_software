"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Timer, Link2, Play, Square } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createTimeEntryAction } from "../entries/actions";

type ProjectOption = { id: string; name: string };

const STORAGE_KEY = "quikfinance:active-timer:v1";

type StoredTimer = {
  startedAt: number; // epoch ms
  projectId: string;
  notes: string;
};

function readStoredTimer(): StoredTimer | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredTimer;
    if (
      typeof parsed?.startedAt !== "number" ||
      typeof parsed?.projectId !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredTimer(t: StoredTimer | null) {
  if (typeof window === "undefined") return;
  if (t === null) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}h : ${pad(m)}m : ${pad(s)}s`;
}

/**
 * StartTimerDialog — modal that lets the user start a running timer
 * against a project, with notes. While running:
 *  - Timer ticks every 1s.
 *  - State is persisted to localStorage so reloads keep it alive.
 *  - "Start Timer" becomes a red "Stop Timer".
 *  - Stopping calls `createTimeEntryAction` to write a TimeEntry with
 *    the elapsed hours (computed as ms / 3600000, max 24).
 */
export function StartTimerDialog({ projects }: { projects: ProjectOption[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  // Running-timer state (persists via localStorage)
  const [stored, setStored] = React.useState<StoredTimer | null>(null);
  const [now, setNow] = React.useState<number>(() => Date.now());

  // Draft form state — used when no timer is running yet
  const [projectId, setProjectId] = React.useState<string>("");
  const [notes, setNotes] = React.useState<string>("");
  const [busy, setBusy] = React.useState(false);

  // Rehydrate on mount.
  React.useEffect(() => {
    const t = readStoredTimer();
    if (t) {
      setStored(t);
      setProjectId(t.projectId);
      setNotes(t.notes);
    }
  }, []);

  // Tick every second while running.
  React.useEffect(() => {
    if (!stored) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stored]);

  const running = stored != null;
  const elapsedMs = running ? now - stored.startedAt : 0;

  function startTimer() {
    if (!projectId) {
      toast.error("Pick a project before starting the timer.");
      return;
    }
    const t: StoredTimer = {
      startedAt: Date.now(),
      projectId,
      notes,
    };
    writeStoredTimer(t);
    setStored(t);
    setNow(Date.now());
  }

  async function stopTimer() {
    if (!stored) return;
    const finalMs = Date.now() - stored.startedAt;
    if (finalMs < 1000) {
      toast.error("Timer is too short to log (under 1 second).");
      return;
    }
    const hours = Math.min(24, Math.max(0.0001, finalMs / 3600000));
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("projectId", stored.projectId);
      fd.set("date", new Date().toISOString().slice(0, 10));
      fd.set("hours", hours.toFixed(4));
      fd.set("description", stored.notes || "Logged via timer");
      await createTimeEntryAction(fd);
      // createTimeEntryAction redirects on success → control may not reach here.
      writeStoredTimer(null);
      setStored(null);
      setOpen(false);
      toast.success(`Logged ${hours.toFixed(2)}h`);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't save time entry";
      if (msg.includes("NEXT_REDIRECT")) {
        // Redirect succeeded — clean up local state.
        writeStoredTimer(null);
        setStored(null);
        setOpen(false);
        toast.success(`Logged ${hours.toFixed(2)}h`);
        return;
      }
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function cancelDraft() {
    if (running) {
      // Don't lose a running timer — just close the modal.
      setOpen(false);
      return;
    }
    // Reset the draft.
    setProjectId("");
    setNotes("");
    setOpen(false);
  }

  function discardRunning() {
    if (!confirm("Discard the running timer? This won't save any time.")) return;
    writeStoredTimer(null);
    setStored(null);
    setProjectId("");
    setNotes("");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          {running ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <span className="tabular-nums text-xs">
                {formatElapsed(elapsedMs).replace(/h |m |s/g, (m) =>
                  m.trim() === "" ? " " : m
                )}
              </span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Start
            </>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md p-0 gap-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 bg-muted/30 border-b text-center">
          <Timer className="h-5 w-5 mx-auto text-muted-foreground mb-1.5" />
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Start Timer
          </div>
          <div className="text-3xl font-semibold tabular-nums mt-2">
            {formatElapsed(elapsedMs)}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Project picker */}
          <div>
            <div className="flex items-center gap-1.5 text-sm text-blue-600 font-medium mb-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Associate Project
              <span className="text-destructive">*</span>
            </div>
            <select
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                if (running) {
                  // Persist project change mid-timer.
                  writeStoredTimer({ ...stored!, projectId: e.target.value });
                }
              }}
              disabled={running}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
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
                You don&apos;t have any projects yet.{" "}
                <a href="/time/projects/new" className="text-blue-600 hover:text-blue-700">
                  Create one first
                </a>
                .
              </p>
            )}
          </div>

          {/* Notes */}
          <div>
            <Label className="mb-1.5 block">Notes</Label>
            <textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                if (running) {
                  writeStoredTimer({ ...stored!, notes: e.target.value });
                }
              }}
              placeholder="Add notes"
              rows={3}
              maxLength={500}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-2 border-t flex items-center gap-2">
          {running ? (
            <>
              <Button
                onClick={stopTimer}
                disabled={busy}
                className="bg-rose-600 hover:bg-rose-700 gap-1.5"
              >
                <Square className="h-3.5 w-3.5" fill="currentColor" />
                {busy ? "Saving…" : "Stop Timer"}
              </Button>
              <Button onClick={() => setOpen(false)} variant="outline" disabled={busy}>
                Close
              </Button>
              <button
                type="button"
                onClick={discardRunning}
                disabled={busy}
                className="ml-auto text-xs text-muted-foreground hover:text-destructive"
              >
                Discard
              </button>
            </>
          ) : (
            <>
              <Button
                onClick={startTimer}
                disabled={!projectId || projects.length === 0}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Start Timer
              </Button>
              <Button onClick={cancelDraft} variant="outline">
                Cancel
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
