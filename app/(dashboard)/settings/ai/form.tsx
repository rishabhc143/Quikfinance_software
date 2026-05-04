"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { updatePreferencesBulkAction } from "../_shared-actions";
import { toast } from "sonner";

export function AiPreferencesForm({ initial }: { initial: { systemPromptOverride: string; rateLimitPerDay: number } }) {
  const router = useRouter();
  const [systemPrompt, setSystemPrompt] = React.useState(initial.systemPromptOverride);
  const [limit, setLimit] = React.useState(initial.rateLimitPerDay);
  const [busy, setBusy] = React.useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await updatePreferencesBulkAction({ aiSystemPromptOverride: systemPrompt || null, aiRateLimitPerDay: limit });
      toast.success("AI preferences saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <Label>System prompt override</Label>
        <Textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={5} placeholder="Leave blank to use the default Quikfinance assistant prompt." />
        <p className="text-xs text-muted-foreground mt-1">Replace or append the default system prompt. Affects every conversation in this organization.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Daily message limit per user</Label>
          <Input type="number" min={0} max={1000} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
          <p className="text-xs text-muted-foreground mt-1">0 disables the rate limit.</p>
        </div>
      </div>
      <div className="flex justify-end pt-2 border-t">
        <Button type="submit" disabled={busy}>{busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
      </div>
    </form>
  );
}
