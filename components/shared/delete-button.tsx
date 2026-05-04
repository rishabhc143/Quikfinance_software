"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  action: () => Promise<unknown>;
  label?: string;
  confirmText?: string;
  redirectTo?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
};

export function DeleteButton({
  action, label = "Delete", confirmText, redirectTo, variant = "outline", size = "sm",
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  async function handle() {
    if (!confirm(confirmText ?? "Delete this record?")) return;
    setBusy(true);
    try {
      await action();
      toast.success("Deleted");
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally { setBusy(false); }
  }
  return (
    <Button variant={variant} size={size} onClick={handle} disabled={busy}>
      <Trash2 className="h-3.5 w-3.5 mr-1" /> {label}
    </Button>
  );
}
