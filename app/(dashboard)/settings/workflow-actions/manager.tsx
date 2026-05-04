"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createWorkflowActionAction, deleteWorkflowActionAction } from "./actions";
import { toast } from "sonner";

type Action = { id: string; name: string; kind: string; isActive: boolean };

export function WorkflowActionsManager({ initial }: { initial: Action[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await createWorkflowActionAction(new FormData(e.currentTarget)); toast.success("Action created"); setShowForm(false); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{initial.length} action{initial.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={() => setShowForm((s) => !s)} variant={showForm ? "outline" : "default"}>
          {showForm ? "Cancel" : <><Plus className="h-3.5 w-3.5 mr-1" /> New action</>}
        </Button>
      </div>
      {showForm && (
        <form onSubmit={create} className="rounded-md border p-4 space-y-3 bg-muted/20">
          <div><Label>Name</Label><Input name="name" required maxLength={120} /></div>
          <div>
            <Label>Kind</Label>
            <select name="kind" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="email">Send email</option><option value="webhook">POST webhook</option><option value="field-update">Update field</option><option value="create-task">Create task</option>
            </select>
          </div>
          <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create</Button></div>
        </form>
      )}
      <div className="rounded-md border divide-y">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No actions yet.</div>
        ) : initial.map((a) => (
          <div key={a.id} className="p-3 flex items-center gap-3 text-sm">
            <div className="flex-1 min-w-0">
              <div className="font-medium">{a.name}</div>
              <Badge variant="outline" className="text-xs">{a.kind}</Badge>
            </div>
            <Button variant="ghost" size="icon" onClick={async () => { if (confirm("Delete?")) { await deleteWorkflowActionAction(a.id); router.refresh(); } }} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
