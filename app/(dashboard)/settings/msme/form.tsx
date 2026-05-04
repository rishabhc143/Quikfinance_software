"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { updatePreferencesBulkAction } from "../_shared-actions";
import { toast } from "sonner";

export function MsmeForm({ initial }: { initial: { registered: boolean; number: string } }) {
  const router = useRouter();
  const [registered, setRegistered] = React.useState(initial.registered);
  const [number, setNumber] = React.useState(initial.number);
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await updatePreferencesBulkAction({ msmeRegistered: registered, msmeNumber: number || null });
      toast.success("MSME settings saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>Registered as MSME</Label>
          <p className="text-xs text-muted-foreground">Enables MSME-specific reporting flags on invoices.</p>
        </div>
        <Switch checked={registered} onCheckedChange={setRegistered} />
      </div>
      {registered && (
        <div>
          <Label>MSME Udyam number</Label>
          <Input value={number} onChange={(e) => setNumber(e.target.value)} placeholder="UDYAM-XX-00-0000000" maxLength={40} />
        </div>
      )}
      <div className="flex justify-end pt-2 border-t">
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
      </div>
    </form>
  );
}
