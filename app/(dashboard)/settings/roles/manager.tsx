"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { createCustomRoleAction, deleteCustomRoleAction } from "./actions";
import { toast } from "sonner";

type Role = { id: string; name: string; description: string; permissions: string[] };

export function CustomRolesManager({ initial, allPermissions }: { initial: Role[]; allPermissions: string[] }) {
  const router = useRouter();
  const [showForm, setShowForm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await createCustomRoleAction(new FormData(e.currentTarget));
      toast.success("Custom role created");
      setShowForm(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this custom role?")) return;
    await deleteCustomRoleAction(id);
    toast.success("Deleted");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{initial.length} custom role{initial.length === 1 ? "" : "s"}</p>
        <Button size="sm" onClick={() => setShowForm((s) => !s)} variant={showForm ? "outline" : "default"}>
          {showForm ? "Cancel" : <><Plus className="h-3.5 w-3.5 mr-1" /> New custom role</>}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={create} className="rounded-md border p-4 space-y-4 bg-muted/20">
          <div><Label>Name</Label><Input name="name" required maxLength={80} placeholder="Sales Manager, AP Clerk, etc." /></div>
          <div><Label>Description</Label><Textarea name="description" rows={2} maxLength={500} /></div>
          <div>
            <Label>Permissions</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 mt-1.5">
              {allPermissions.map((p) => (
                <label key={p} className="flex items-center gap-2 text-xs">
                  <input type="checkbox" name="permissions" value={p} className="h-3.5 w-3.5" />
                  {p}
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Create role</Button>
          </div>
        </form>
      )}

      {initial.length === 0 ? (
        <div className="rounded-md border bg-background p-6 text-sm text-center text-muted-foreground">
          No custom roles yet. The four built-in roles cover most teams.
        </div>
      ) : (
        <div className="rounded-md border divide-y">
          {initial.map((r) => (
            <div key={r.id} className="p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{r.name}</div>
                {r.description && <div className="text-xs text-muted-foreground mt-0.5">{r.description}</div>}
                <div className="flex flex-wrap gap-1 mt-2">
                  {r.permissions.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No permissions granted</span>
                  ) : r.permissions.map((p) => <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>)}
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label="Delete">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
