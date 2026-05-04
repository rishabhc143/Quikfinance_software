"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { updatePreferenceAction } from "../_shared-actions";
import { toast } from "sonner";

export function DigitalSignatureForm({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  async function toggle(v: boolean) {
    setEnabled(v); setBusy(true);
    try { await updatePreferenceAction({ key: "digitalSignatureEnabled", value: v }); toast.success("Saved"); router.refresh(); }
    catch { setEnabled(!v); toast.error("Save failed"); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>Sign documents</Label>
          <p className="text-xs text-muted-foreground">Append a digital signature block to outgoing PDFs.</p>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} disabled={busy} />
      </div>
      <p className="text-xs text-muted-foreground">Signing certificates upload via the Integrations workflow (planned). The toggle gates the feature.</p>
    </div>
  );
}
