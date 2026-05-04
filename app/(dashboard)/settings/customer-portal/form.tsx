"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Copy } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { updatePreferenceAction } from "../_shared-actions";
import { toast } from "sonner";

export function PortalForm({
  label, description, prefKey, initialEnabled, slug, kind,
}: {
  label: string;
  description: string;
  prefKey: "customerPortalEnabled" | "vendorPortalEnabled";
  initialEnabled: boolean;
  slug: string;
  kind: "customer" | "vendor";
}) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [busy, setBusy] = React.useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/portal/${kind}/${slug}`;

  async function toggle(v: boolean) {
    setEnabled(v);
    setBusy(true);
    try {
      await updatePreferenceAction({ key: prefKey, value: v });
      toast.success(v ? "Portal enabled" : "Portal disabled");
      router.refresh();
    } catch {
      setEnabled(!v);
      toast.error("Save failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>{label}</Label>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={toggle} disabled={busy} />
      </div>
      {enabled && (
        <div>
          <Label>Portal URL (placeholder)</Label>
          <div className="flex gap-2">
            <input readOnly value={url} className="flex-1 px-3 py-2 text-sm bg-muted rounded-md border" />
            <Button type="button" onClick={() => { navigator.clipboard.writeText(url); toast.success("Copied"); }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Portal pages render in a future release. The toggle gates whether portal-link emails are sent.</p>
        </div>
      )}
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
    </div>
  );
}
