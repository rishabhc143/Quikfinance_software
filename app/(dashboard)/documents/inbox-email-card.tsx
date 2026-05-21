"use client";

import * as React from "react";
import { Mail, Copy, RefreshCw, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  getInboxEmailForOrgAction,
  rotateInboxEmailAction,
} from "./actions";

/**
 * DOC-D3.1: Inbox-email card surfacing the per-org Smart Capture
 * email address. Used in the Files inbox + Bank Statements inbox
 * (replaces the old "Coming soon" placeholders) and accepts a
 * `variant` prop to control the visual weight:
 *   - "default": full card with description + Copy + Rotate
 *   - "compact": one-line strip suitable for a list footer
 *
 * On mount the component calls `getInboxEmailForOrgAction` to fetch
 * (or lazily create) the address. When `configured: false` (operator
 * hasn't set INBOUND_EMAIL_DOMAIN env), the card surfaces a
 * "Coming soon" hint with a hyperlink to the deploy docs.
 */
export function InboxEmailCard({
  variant = "default",
}: {
  variant?: "default" | "compact";
}) {
  const [loading, setLoading] = React.useState(true);
  const [email, setEmail] = React.useState<string | null>(null);
  const [configured, setConfigured] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [rotating, setRotating] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getInboxEmailForOrgAction()
      .then((r) => {
        if (cancelled) return;
        setEmail(r.email);
        setConfigured(r.configured);
      })
      .catch((err) => {
        console.error("[inbox-email-card] fetch failed", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCopy() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — select and copy manually.");
    }
  }

  async function onRotate() {
    if (
      !confirm(
        "Generate a fresh inbox address? The old one stops accepting forwards immediately."
      )
    )
      return;
    setRotating(true);
    const result = await rotateInboxEmailAction();
    setRotating(false);
    if (!result.ok) return;
    setEmail(result.email);
    toast.success("New inbox address generated.");
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-muted/20 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading inbox address…
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="rounded-lg border bg-muted/20 px-4 py-3 flex items-center gap-3">
        <div className="shrink-0 h-9 w-9 rounded-md bg-orange-100 flex items-center justify-center">
          <Mail className="h-4 w-4 text-orange-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Upload Files via Email</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Coming soon — operator needs to configure{" "}
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
              INBOUND_EMAIL_DOMAIN
            </code>{" "}
            +{" "}
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">
              INBOUND_EMAIL_WEBHOOK_SECRET
            </code>{" "}
            in Vercel env.
          </p>
        </div>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/20 px-3 py-2 text-xs">
        <Mail className="h-3.5 w-3.5 text-orange-500 shrink-0" />
        <code className="flex-1 truncate font-mono text-foreground" title={email ?? ""}>
          {email}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="p-1 rounded hover:bg-muted"
          aria-label="Copy address"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-600" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/20 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 h-10 w-10 rounded-md bg-orange-100 flex items-center justify-center">
          <Mail className="h-5 w-5 text-orange-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Upload Files via Email</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Forward bank statements, vendor bills, or receipts from your
            real inbox to the address below — Smart Capture parses them
            automatically.
          </p>
          <div className="mt-3 flex items-center gap-2 rounded-md border bg-background px-3 py-2">
            <code className="flex-1 truncate font-mono text-xs" title={email ?? ""}>
              {email}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCopy}
              className="h-7"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 mr-1.5 text-emerald-600" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3 mr-1.5" />
                  Copy
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void onRotate()}
              disabled={rotating}
              className="h-7"
              title="Rotate to a fresh address if you think this one leaked"
            >
              {rotating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Tip: set up auto-forwarding in Gmail / Outlook to send
            statements straight here — see{" "}
            <a
              href="https://support.google.com/mail/answer/10957"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Google
            </a>{" "}
            /{" "}
            <a
              href="https://support.microsoft.com/en-us/office/forward-email-from-outlook-com-to-another-email-account-d40e2818-1ed5-4d77-add0-bb09404b3ce6"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              Outlook
            </a>{" "}
            docs.
          </p>
        </div>
      </div>
    </div>
  );
}
