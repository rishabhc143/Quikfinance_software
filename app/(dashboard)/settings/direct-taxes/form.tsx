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

export function DirectTaxesForm({ initial }: { initial: { tdsEnabled: boolean; tan: string; pan: string } }) {
  const router = useRouter();
  const [tdsEnabled, setTdsEnabled] = React.useState(initial.tdsEnabled);
  const [tan, setTan] = React.useState(initial.tan);
  const [pan, setPan] = React.useState(initial.pan);
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await updatePreferencesBulkAction({ tdsEnabled, tanNumber: tan || null, panNumber: pan || null });
      toast.success("Direct tax settings saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>TDS / withholding enabled</Label>
          <p className="text-xs text-muted-foreground">Show withholding fields on invoices and bills.</p>
        </div>
        <Switch checked={tdsEnabled} onCheckedChange={setTdsEnabled} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div><Label>PAN</Label><Input value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} maxLength={20} placeholder="AAAAA1234A" /></div>
        <div><Label>TAN</Label><Input value={tan} onChange={(e) => setTan(e.target.value.toUpperCase())} maxLength={20} placeholder="ABCD12345E" /></div>
      </div>
      <div className="flex justify-end pt-2 border-t">
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
      </div>
    </form>
  );
}
