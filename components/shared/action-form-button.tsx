"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Thin wrapper that submits a server action when clicked. Use this
 * for status-transition buttons (Mark Issued / Close / Convert to
 * Bill) on detail pages — server actions can be bound via `.bind(
 * null, id)` and passed as the `action` prop.
 *
 * On success: shows a toast (defaults to "Done") and triggers a
 * router refresh so the page re-fetches. On error: toast.error with
 * the thrown message.
 *
 * Why not just `<form action={...}>`? Because we want the disabled
 * spinner state, the toast feedback, and the router.refresh() to
 * happen after the action returns — without forcing every caller
 * site to write that boilerplate.
 */
type Props = {
  action: () => Promise<unknown>;
  label: string;
  icon?: React.ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  successToast?: string;
  /** When set, the action is presumed to redirect; we skip the
   *  router.refresh() in that case. */
  redirects?: boolean;
};

export function ActionFormButton({
  action,
  label,
  icon,
  variant = "default",
  size = "sm",
  successToast,
  redirects = false,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function handle() {
    setBusy(true);
    try {
      await action();
      toast.success(successToast ?? "Done");
      if (!redirects) router.refresh();
    } catch (err) {
      // Next.js redirect() throws — that's not a real error.
      const msg = err instanceof Error ? err.message : "Action failed";
      if (msg.startsWith("NEXT_REDIRECT")) return;
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handle}
      disabled={busy}
      className="gap-1"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </Button>
  );
}
