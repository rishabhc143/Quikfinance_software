"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { createWorkflowRuleAction, setWorkflowRuleActiveAction, deleteWorkflowRuleAction } from "./actions";
import { toast } from "sonner";

type Rule = { id: string; name: string; module: string; trigger: string; isActive: boolean };

export function WorkflowRulesManager({ initial }: { initial: Rule[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await createWorkflowRuleAction(new FormData(e.currentTarget)); toast.success("Rule created"); setShowForm(false); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{initial.length} rule{initial.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={() => setShowForm((s) => !s)} variant={showForm ? "outline" : "default"}>
          {showForm ? "Cancel" : <><Plus className="h-3.5 w-3.5 mr-1" /> New rule</>}
        </Button>
      </div>
      {showForm && (
        <form onSubmit={create} className="rounded-md border p-4 space-y-3 bg-muted/20">
          <div><Label>Name</Label><Input name="name" required maxLength={120} /></div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Module</Label>
              <select name="module" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option>invoice</option><option>bill</option><option>contact</option><option>item</option><option>payment</option>
              </select>
            </div>
            <div>
              <Label>Trigger</Label>
              <select name="trigger" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="created">On create</option><option value="updated">On update</option><option value="status_changed">On status change</option><option value="deleted">On delete</option>
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Conditions and action chain UI ship in a future release; rules saved today fire when their module/trigger pair matches.</p>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button></div>
        </form>
      )}
      <div className="rounded-md border divide-y">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No rules yet.</div>
        ) : initial.map((r) => (
          <div key={r.id} className="p-3 flex items-center gap-3 text-sm">
            <Switch checked={r.isActive} onCheckedChange={async (v) => { await setWorkflowRuleActiveAction(r.id, v); router.refresh(); }} />
            <div className="flex-1 min-w-0">
              <div className="font-medium">{r.name}</div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Badge variant="outline">{r.module}</Badge> <span>on</span> <Badge variant="outline">{r.trigger}</Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={async () => { if (confirm("Delete?")) { await deleteWorkflowRuleAction(r.id); router.refresh(); } }} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
