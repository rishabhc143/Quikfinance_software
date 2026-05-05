"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function SalesOrderActionButton({
  action,
  label,
  variant = "default",
}: {
  action: () => Promise<unknown>;
  label: string;
  variant?: "default" | "outline";
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant={variant}
      size="sm"
      onClick={async () => {
        setBusy(true);
        try {
          await action();
          router.refresh();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Action failed");
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      className="gap-1"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {label}
    </Button>
  );
}
