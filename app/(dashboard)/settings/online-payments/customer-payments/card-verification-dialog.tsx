"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { updateCardVerificationSettingAction } from "./actions";

/**
 * v1 stub per spec — toggles `cardVerificationEnabled` on the org's
 * PaymentGatewayConfig. The actual small-test-charge flow is a TODO.
 */
export function CardVerificationDialog({
  enabled,
  trigger,
}: {
  enabled: boolean;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(enabled);
  const [busy, setBusy] = React.useState(false);

  async function onSave() {
    setBusy(true);
    try {
      const r = await updateCardVerificationSettingAction(value);
      if (!r.ok) {
        toast.error(r.error ?? "Save failed");
        return;
      }
      toast.success("Card verification setting updated");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Card Verification Settings</DialogTitle>
          <DialogDescription>
            Verify the card with a small test charge before saving the
            payment method. The actual verification charge flow ships in
            a follow-up release.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-4 rounded-md border p-3">
          <div className="text-sm">
            <div className="font-medium">Enable card verification</div>
            <div className="text-xs text-muted-foreground">
              When enabled, a small test charge will be issued before
              saving a card.
            </div>
          </div>
          <Switch
            checked={value}
            onCheckedChange={setValue}
            aria-label="Enable card verification"
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={onSave} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
