"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { updatePreferenceAction } from "../_shared-actions";
import { toast } from "sonner";

export function SmsForm({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  async function toggle(v: boolean) {
    setEnabled(v); setBusy(true);
    try { await updatePreferenceAction({ key: "smsEnabled", value: v }); toast.success("Saved"); router.refresh(); }
    catch { setEnabled(!v); toast.error("Save failed"); }
    finally { setBusy(false); }
  }
  return (
    <div className="flex items-center justify-between">
      <div>
        <Label>Enable SMS notifications</Label>
        <p className="text-xs text-muted-foreground">Customers receive SMS for invoices and receipts.</p>
      </div>
      <Switch checked={enabled} onCheckedChange={toggle} disabled={busy} />
    </div>
  );
}
