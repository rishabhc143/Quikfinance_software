"use client";

import * as React from "react";
import { BellRing, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  bankSlug: string;
  bankName: string;
  initialSubscribed: boolean;
  action: (input: {
    bankSlug: string;
    enabled: boolean;
  }) => Promise<{ ok: true; subscribed: boolean }>;
};

/**
 * Client wrapper for the "Notify me" toggle on the partner-bank
 * stub page. Optimistically flips the visible state, then calls the
 * server action. On error, reverts.
 */
export function NotifyMeButton({
  bankSlug,
  bankName,
  initialSubscribed,
  action,
}: Props) {
  const [subscribed, setSubscribed] = React.useState(initialSubscribed);
  const [busy, setBusy] = React.useState(false);

  async function handle() {
    const next = !subscribed;
    setSubscribed(next);
    setBusy(true);
    try {
      await action({ bankSlug, enabled: next });
      toast.success(
        next
          ? `We'll email you when ${bankName} integration is live.`
          : `Unsubscribed from ${bankName} notifications.`
      );
    } catch (err) {
      setSubscribed(!next); // revert
      toast.error(
        err instanceof Error ? err.message : "Couldn't save preference"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      size="sm"
      variant={subscribed ? "outline" : "ghost"}
      onClick={handle}
      disabled={busy}
      className="gap-1"
    >
      {busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : subscribed ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <BellRing className="h-3.5 w-3.5" />
      )}
      {subscribed ? "We'll notify you" : "Notify me"}
    </Button>
  );
}
