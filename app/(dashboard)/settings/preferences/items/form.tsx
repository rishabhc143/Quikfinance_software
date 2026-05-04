"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { setInventoryEnabledAction } from "./actions";
import { toast } from "sonner";

export function ItemsPreferencesForm({ initialEnabled }: { initialEnabled: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [busy, setBusy] = React.useState(false);

  async function toggle(next: boolean) {
    setEnabled(next);
    setBusy(true);
    try {
      await setInventoryEnabledAction(next);
      toast.success(next ? "Inventory tracking enabled" : "Inventory tracking disabled");
      router.refresh();
    } catch {
      setEnabled(!next);
      toast.error("Failed to update preference");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div>
        <Label htmlFor="inventory" className="text-sm font-medium">Enable Inventory Tracking</Label>
        <p className="text-xs text-muted-foreground mt-0.5">
          When on, the New/Edit Item form shows the Inventory Information section with opening stock and reorder fields.
        </p>
      </div>
      <Switch id="inventory" checked={enabled} onCheckedChange={toggle} disabled={busy} />
    </div>
  );
}
