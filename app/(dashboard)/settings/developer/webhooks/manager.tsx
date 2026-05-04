"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createWebhookAction, deleteWebhookAction } from "./actions";
import { toast } from "sonner";

type Hook = { id: string; url: string; event: string; isActive: boolean };

export function WebhooksManager({ initial }: { initial: Hook[] }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try { await createWebhookAction(new FormData(e.currentTarget)); toast.success("Webhook subscribed"); (e.target as HTMLFormElement).reset(); router.refresh(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid gap-3 md:grid-cols-3">
        <div><Label>Webhook URL</Label><Input name="url" type="url" required placeholder="https://api.you.com/webhook" /></div>
        <div>
          <Label>Event</Label>
          <select name="event" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option>invoice.created</option><option>invoice.paid</option><option>bill.created</option><option>bill.paid</option><option>payment.received</option><option>payment.made</option>
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="w-full">{busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Subscribe</Button>
        </div>
      </form>
      <div className="rounded-md border divide-y">
        {initial.length === 0 ? (
          <div className="p-6 text-sm text-center text-muted-foreground">No webhooks subscribed yet.</div>
        ) : initial.map((h) => (
          <div key={h.id} className="p-3 flex items-center gap-3 text-sm">
            <Badge variant="outline">{h.event}</Badge>
            <code className="flex-1 truncate text-xs">{h.url}</code>
            {h.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="secondary">Paused</Badge>}
            <Button variant="ghost" size="icon" onClick={async () => { if (confirm("Delete?")) { await deleteWebhookAction(h.id); router.refresh(); } }} aria-label="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}
