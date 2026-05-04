"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updatePreferencesBulkAction } from "../_shared-actions";
import { toast } from "sonner";

export function UserPreferencesForm({ initial }: { initial: { themeDefault: string; densityDefault: string } }) {
  const router = useRouter();
  const [theme, setTheme] = React.useState(initial.themeDefault);
  const [density, setDensity] = React.useState(initial.densityDefault);
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await updatePreferencesBulkAction({ themeDefault: theme, densityDefault: density });
      toast.success("Preferences saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Default theme</Label>
          <select value={theme} onChange={(e) => setTheme(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </div>
        <div>
          <Label>Default density</Label>
          <select value={density} onChange={(e) => setDensity(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
            <option value="comfortable">Comfortable</option><option value="compact">Compact</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Each user can override these in the right-rail toggle.</p>
      <div className="flex justify-end pt-2 border-t">
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
      </div>
    </form>
  );
}
