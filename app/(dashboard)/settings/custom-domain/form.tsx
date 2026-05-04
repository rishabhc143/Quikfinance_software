"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { updatePreferenceAction } from "../_shared-actions";
import { toast } from "sonner";

export function CustomDomainForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [domain, setDomain] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await updatePreferenceAction({ key: "customDomain", value: domain.trim() || null });
      toast.success("Custom domain saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div>
        <Label>Custom domain</Label>
        <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="books.yourcompany.com" type="text" />
        <p className="text-xs text-muted-foreground mt-1">Leave blank to use the default Quikfinance domain.</p>
      </div>
      <div className="flex justify-end pt-2 border-t">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  );
}
