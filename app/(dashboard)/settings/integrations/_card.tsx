"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { setIntegrationConnectedAction } from "./_action";
import { toast } from "sonner";

export function IntegrationCard({ kind, label, connected }: { kind: string; label: string; connected: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function flip() {
    setBusy(true);
    try {
      await setIntegrationConnectedAction(kind, !connected);
      toast.success(!connected ? "Connected" : "Disconnected");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="font-medium flex items-center gap-2">
          {label}
          {connected && <Badge variant="success" className="text-xs"><Check className="h-3 w-3 mr-0.5" />Connected</Badge>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Provider keys are configured in your environment. Toggling connection here flips the gate; the actual API call uses keys you set in your hosting provider.
        </p>
      </div>
      <Button onClick={flip} disabled={busy} variant={connected ? "outline" : "default"}>
        {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />}
        {connected ? "Disconnect" : "Connect"}
      </Button>
    </div>
  );
}
