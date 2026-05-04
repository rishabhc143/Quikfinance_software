"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createScheduleAction, deleteScheduleAction } from "./actions";
import { toast } from "sonner";

type Sched = { id: string; name: string; cron: string; taskKind: string; isActive: boolean; lastRunAt: string | null };

export function SchedulesManager({ initial }: { initial: Sched[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await createScheduleAction(new FormData(e.currentTarget)); toast.success("Schedule created"); setShowForm(false); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{initial.length} schedule{initial.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={() => setShowForm((s) => !s)} variant={showForm ? "outline" : "default"}>{showForm ? "Cancel" : <><Plus className="h-3.5 w-3.5 mr-1" /> New schedule</>}</Button>
      </div>
      {showForm && (
        <form onSubmit={create} className="rounded-md border p-4 space-y-3 bg-muted/20">
          <div><Label>Name</Label><Input name="name" required maxLength={120} placeholder="Daily reminders" /></div>
          <div className="grid gap-3 md:grid-cols-2">
            <div><Label>Cron expression</Label><Input name="cron" required maxLength={80} placeholder="0 9 * * *" /></div>
            <div>
              <Label>Task</Label>
              <select name="taskKind" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="reminders">Dispatch reminders</option><option value="recurring-invoices">Run recurring invoices</option><option value="recurring-bills">Run recurring bills</option><option value="close-books">Monthly book close</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">A cron worker invokes scheduled tasks. Worker process is queued for a future release.</p>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button></div>
        </form>
      )}
      <div className="rounded-md border divide-y">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No schedules yet.</div>
        ) : initial.map((s) => (
          <div key={s.id} className="p-3 flex items-center gap-3 text-sm">
            <div className="flex-1 min-w-0">
              <div className="font-medium">{s.name}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{s.taskKind}</Badge>
                <code className="font-mono">{s.cron}</code>
                {s.lastRunAt && <span>Last ran {format(new Date(s.lastRunAt), "dd MMM yyyy HH:mm")}</span>}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={async () => { if (confirm("Delete?")) { await deleteScheduleAction(s.id); router.refresh(); } }} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
