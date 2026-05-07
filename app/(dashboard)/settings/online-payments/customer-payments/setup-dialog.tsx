"use client";

import * as React from "react";
import { Copy, Eye, EyeOff, Loader2, Check, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  setupRazorpayAction,
  testRazorpayConnectionAction,
} from "./actions";

/**
 * Setup / Manage modal. Doubles as the "Manage" entry point — secrets
 * are NEVER pre-filled (we don't decrypt them for display); the user
 * re-enters them to update.
 */
export function SetupDialog({
  initial,
  webhookUrl,
  triggerLabel,
  triggerVariant = "default",
}: {
  initial: { mode: "test" | "live"; keyId: string };
  webhookUrl: string;
  triggerLabel: string;
  triggerVariant?: "default" | "outline";
}) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState(initial.mode);
  const [keyId, setKeyId] = React.useState(initial.keyId);
  const [keySecret, setKeySecret] = React.useState("");
  const [webhookSecret, setWebhookSecret] = React.useState("");
  const [showKeySecret, setShowKeySecret] = React.useState(false);
  const [showWebhookSecret, setShowWebhookSecret] = React.useState(false);
  const [testStatus, setTestStatus] = React.useState<"idle" | "ok" | "fail">(
    "idle"
  );
  const [testing, setTesting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  async function onTest() {
    setTesting(true);
    setTestStatus("idle");
    try {
      const r = await testRazorpayConnectionAction({ keyId, keySecret });
      if (r.ok) {
        setTestStatus("ok");
        toast.success("Razorpay credentials verified");
      } else {
        setTestStatus("fail");
        toast.error(r.error ?? "Connection failed");
      }
    } catch (e) {
      setTestStatus("fail");
      toast.error(e instanceof Error ? e.message : "Connection failed");
    } finally {
      setTesting(false);
    }
  }

  async function onSave() {
    setSaving(true);
    try {
      const r = await setupRazorpayAction({
        mode,
        keyId,
        keySecret,
        webhookSecret,
      });
      if (!r.ok) {
        toast.error(r.error ?? "Save failed");
        return;
      }
      toast.success("Razorpay configured");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerVariant}>
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Set up Razorpay</DialogTitle>
          <DialogDescription>
            Enter your Razorpay credentials. Secrets are AES-256-GCM
            encrypted at rest.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div>
            <Label className="block text-sm">Mode</Label>
            <div className="mt-2 flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  value="test"
                  checked={mode === "test"}
                  onChange={() => setMode("test")}
                />
                Test
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="mode"
                  value="live"
                  checked={mode === "live"}
                  onChange={() => setMode("live")}
                />
                Live
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="keyId">Key ID *</Label>
            <Input
              id="keyId"
              value={keyId}
              onChange={(e) => setKeyId(e.target.value)}
              placeholder={mode === "test" ? "rzp_test_..." : "rzp_live_..."}
              autoComplete="off"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="keySecret">Key Secret *</Label>
            <div className="relative">
              <Input
                id="keySecret"
                type={showKeySecret ? "text" : "password"}
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
                placeholder="••••••••"
                autoComplete="off"
              />
              <button
                type="button"
                aria-label={showKeySecret ? "Hide secret" : "Show secret"}
                onClick={() => setShowKeySecret((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showKeySecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="webhookSecret">Webhook Secret *</Label>
            <div className="relative">
              <Input
                id="webhookSecret"
                type={showWebhookSecret ? "text" : "password"}
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="••••••••"
                autoComplete="off"
              />
              <button
                type="button"
                aria-label={
                  showWebhookSecret
                    ? "Hide webhook secret"
                    : "Show webhook secret"
                }
                onClick={() => setShowWebhookSecret((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showWebhookSecret ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Set this exact value in your Razorpay dashboard under
              Webhooks for the URL shown below.
            </p>
          </div>

          <div className="space-y-1">
            <Label>Webhook URL</Label>
            <div className="flex items-center gap-2">
              <Input
                value={webhookUrl}
                readOnly
                className="font-mono text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  toast.success("Copied");
                }}
                aria-label="Copy webhook URL"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
            <div className="font-medium">Subscribed events</div>
            <ul className="list-disc list-inside text-muted-foreground">
              <li>payment.captured</li>
              <li>payment.failed</li>
              <li>refund.processed</li>
            </ul>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={onTest}
              disabled={testing || !keyId || !keySecret}
            >
              {testing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1" />
              ) : null}
              Test Connection
            </Button>
            {testStatus === "ok" ? (
              <Check className="h-4 w-4 text-green-600" aria-label="Connected" />
            ) : null}
            {testStatus === "fail" ? (
              <X className="h-4 w-4 text-destructive" aria-label="Failed" />
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={onSave}
            disabled={saving || !keyId || !keySecret || !webhookSecret}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
