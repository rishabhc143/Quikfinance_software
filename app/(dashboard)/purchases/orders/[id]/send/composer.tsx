"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Send-PO email composer. Wraps the
 * `sendPurchaseOrderAction(id, {to, cc, subject, body})` server
 * action with a busy-state + toast feedback.
 *
 * Renders a "Pre-fill from vendor" hint when the vendor doesn't have
 * an email on file (the To field starts empty in that case).
 *
 * Attachment is implicit — the PO PDF is fetched server-side on send.
 * We surface a `Paperclip` icon so the user knows the PDF is coming.
 */
type SendInput = {
  to: string;
  cc?: string;
  subject: string;
  body: string;
};

type Props = {
  action: (input: SendInput) => Promise<unknown>;
  defaultTo: string;
  vendorName: string;
  defaultSubject: string;
  defaultBody: string;
  poId: string;
};

export function SendComposer({
  action,
  defaultTo,
  vendorName,
  defaultSubject,
  defaultBody,
  poId,
}: Props) {
  const [to, setTo] = React.useState(defaultTo);
  const [cc, setCc] = React.useState("");
  const [subject, setSubject] = React.useState(defaultSubject);
  const [body, setBody] = React.useState(defaultBody);
  const [busy, setBusy] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!to.trim()) {
      toast.error("Recipient email required");
      return;
    }
    setBusy(true);
    try {
      await action({ to: to.trim(), cc: cc.trim(), subject, body });
      toast.success(`Queued for ${to.trim()}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Send failed";
      // Next.js redirects throw a sentinel error we ignore.
      if (msg.startsWith("NEXT_REDIRECT")) return;
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!defaultTo ? (
        <p className="rounded-md border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs">
          {vendorName} doesn&apos;t have an email on file. Type one below or{" "}
          <Link
            href={`/purchases/vendors`}
            className="underline"
          >
            edit the vendor
          </Link>{" "}
          to save it for next time.
        </p>
      ) : null}

      <div className="space-y-1">
        <Label htmlFor="to">To *</Label>
        <Input
          id="to"
          type="email"
          required
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="vendor@example.com"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="cc">CC (comma-separated)</Label>
        <Input
          id="cc"
          value={cc}
          onChange={(e) => setCc(e.target.value)}
          placeholder="accounts@example.com, you@example.com"
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="subject">Subject *</Label>
        <Input
          id="subject"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="body">Message</Label>
        <Textarea
          id="body"
          rows={10}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <div className="rounded-md border bg-muted/40 p-3 flex items-center gap-2 text-xs">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <span>
          PDF will be attached as{" "}
          <span className="font-mono">
            purchase-order-{poId.slice(-6)}.pdf
          </span>
        </span>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={busy} className="gap-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Send
        </Button>
      </div>
    </form>
  );
}
