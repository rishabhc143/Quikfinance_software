"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createReportingTagAction, deleteReportingTagAction } from "./actions";
import { toast } from "sonner";

type Tag = { id: string; name: string; color: string };

export function ReportingTagsManager({ initial }: { initial: Tag[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await createReportingTagAction(new FormData(e.currentTarget)); toast.success("Tag created"); (e.target as HTMLFormElement).reset(); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid gap-3 md:grid-cols-3">
        <div><Label>Name</Label><Input name="name" required maxLength={80} placeholder="Department, Project, Region…" /></div>
        <div>
          <Label>Color</Label>
          <Input name="color" type="color" defaultValue="#1d4ed8" className="h-10" />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="w-full">{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Add tag</Button>
        </div>
      </form>
      <div className="rounded-md border divide-y">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No tags yet.</div>
        ) : initial.map((t) => (
          <div key={t.id} className="p-3 flex items-center gap-3 text-sm">
            <span className="h-4 w-4 rounded-full inline-block" style={{ backgroundColor: t.color }} />
            <span className="flex-1 font-medium">{t.name}</span>
            <Button variant="ghost" size="icon" onClick={async () => { if (confirm("Delete?")) { await deleteReportingTagAction(t.id); router.refresh(); } }} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
