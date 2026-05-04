"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { createReminderAction, setReminderActiveAction, deleteReminderAction } from "./actions";
import { toast } from "sonner";

type Reminder = { id: string; name: string; appliesTo: string; daysBefore: number; daysAfter: number; isActive: boolean; template: string };

export function RemindersManager({ initial }: { initial: Reminder[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await createReminderAction(new FormData(e.currentTarget)); toast.success("Reminder created"); setShowForm(false); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }
  async function toggle(id: string, v: boolean) { await setReminderActiveAction(id, v); router.refresh(); }
  async function remove(id: string) { if (!confirm("Delete this reminder?")) return; await deleteReminderAction(id); router.refresh(); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{initial.length} reminder{initial.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={() => setShowForm((s) => !s)} variant={showForm ? "outline" : "default"}>
          {showForm ? "Cancel" : <><Plus className="h-3.5 w-3.5 mr-1" /> New reminder</>}
        </Button>
      </div>
      {showForm && (
        <form onSubmit={create} className="rounded-md border p-4 space-y-3 bg-muted/20">
          <div><Label>Name</Label><Input name="name" required maxLength={120} placeholder="3 days before due" /></div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Applies to</Label>
              <select name="appliesTo" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="invoice">Invoice</option><option value="bill">Bill</option><option value="estimate">Estimate</option>
              </select>
            </div>
            <div><Label>Days before due</Label><Input type="number" name="daysBefore" defaultValue={0} min={0} max={365} /></div>
            <div><Label>Days after due</Label><Input type="number" name="daysAfter" defaultValue={0} min={0} max={365} /></div>
          </div>
          <div><Label>Email template</Label><Textarea name="template" rows={3} placeholder="Hi {customer}, your invoice {number} is due in {days} days." /></div>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button></div>
        </form>
      )}
      <div className="rounded-md border divide-y">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No reminders yet.</div>
        ) : initial.map((r) => (
          <div key={r.id} className="p-3 flex items-center gap-3 text-sm">
            <Switch checked={r.isActive} onCheckedChange={(v) => toggle(r.id, v)} />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{r.name}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{r.appliesTo}</Badge>
                {r.daysBefore > 0 && <span>{r.daysBefore}d before</span>}
                {r.daysAfter > 0 && <span>{r.daysAfter}d after</span>}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">A daily worker will dispatch reminders matching due-date offsets. Worker process is queued for a future release; rules are recorded today.</p>
    </div>
  );
}
