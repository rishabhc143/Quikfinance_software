"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Star, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { addLocationAction, deleteLocationAction, makePrimaryLocationAction } from "./actions";
import { toast } from "sonner";

type Loc = { id: string; name: string; address: string; isPrimary: boolean };

export function LocationsManager({ initial }: { initial: Loc[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await addLocationAction({ name: name.trim(), address: address.trim() || null });
      toast.success("Location added");
      setName(""); setAddress("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Add failed");
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm("Delete this location?")) return;
    await deleteLocationAction(id);
    toast.success("Deleted");
    router.refresh();
  }
  async function makePrimary(id: string) {
    await makePrimaryLocationAction(id);
    toast.success("Primary location updated");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <form onSubmit={add} className="grid gap-3 md:grid-cols-3">
        <div className="md:col-span-1">
          <Label htmlFor="loc-name">Name</Label>
          <Input id="loc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="HQ, Warehouse, etc." required />
        </div>
        <div className="md:col-span-1">
          <Label htmlFor="loc-address">Address</Label>
          <Input id="loc-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Optional" />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Add location
          </Button>
        </div>
      </form>

      <div className="rounded-md border divide-y">
        {initial.length === 0 && (
          <div className="p-6 text-sm text-center text-muted-foreground">No locations yet — add one above.</div>
        )}
        {initial.map((l) => (
          <div key={l.id} className="flex items-center gap-3 p-3 text-sm">
            <div className="flex-1 min-w-0">
              <div className="font-medium flex items-center gap-2">
                {l.name}
                {l.isPrimary && <Badge variant="success">Primary</Badge>}
              </div>
              {l.address && <div className="text-xs text-muted-foreground truncate">{l.address}</div>}
            </div>
            {!l.isPrimary && (
              <Button variant="ghost" size="sm" onClick={() => makePrimary(l.id)} title="Make primary">
                <Star className="h-4 w-4" />
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => remove(l.id)} title="Delete">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
