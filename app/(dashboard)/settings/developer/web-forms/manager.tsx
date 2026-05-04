"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createWebFormAction, deleteWebFormAction } from "./actions";
import { toast } from "sonner";

type Form = { id: string; name: string; slug: string; isActive: boolean; submissionsCount: number };

export function WebFormsManager({ initial }: { initial: Form[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await createWebFormAction(new FormData(e.currentTarget)); toast.success("Form created"); (e.target as HTMLFormElement).reset(); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid gap-3 md:grid-cols-3">
        <div><Label>Name</Label><Input name="name" required maxLength={120} /></div>
        <div><Label>URL slug</Label><Input name="slug" required pattern="[a-z0-9-]+" maxLength={120} placeholder="contact-us" /></div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="w-full">{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Create form</Button>
        </div>
      </form>
      <div className="rounded-md border divide-y">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No web forms yet.</div>
        ) : initial.map((f) => {
          const url = typeof window === "undefined" ? "" : `${window.location.origin}/forms/${f.slug}`;
          return (
            <div key={f.id} className="p-3 flex items-center gap-3 text-sm">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{f.name}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <code>{url}</code>
                  <Badge variant="outline">{f.submissionsCount} submissions</Badge>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }} aria-label="Copy URL"><Copy className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={async () => { if (confirm("Delete?")) { await deleteWebFormAction(f.id); router.refresh(); } }} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Public form rendering at /forms/[slug] ships with a future release. Submissions endpoint is queued.</p>
    </div>
  );
}
