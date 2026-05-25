"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/shared/date-picker";
import { format } from "date-fns";
import { toast } from "sonner";
import { applyMergeTags, type MergeTagContext } from "@/lib/sales/merge-tags";

/**
 * INVOICE EMAIL — "Send via Email" dialog.
 *
 * Mirrors `send-reminder-dialog.tsx` (subject + body + live preview +
 * Send Now / Send Later) but targets the invoice itself rather than a
 * payment reminder. The PDF + HTML rendering of the invoice are
 * attached automatically by `sendInvoiceAction` server-side.
 *
 * Default template lives here (Phase A). Phase B will pull the
 * default from `OrganizationPreference` so the Accounts team can
 * customize it once + reuse across invoices.
 */
const DEFAULT_SUBJECT = "Invoice {{document.number}} from {{org.name}}";
const DEFAULT_BODY = `<p>Hello {{customer.name}},</p>
<p>Please find your invoice <strong>{{document.number}}</strong>
attached. The total is <strong>{{document.total}}</strong>, due
<strong>{{document.dueDate}}</strong>.</p>
<p>Let me know if you have any questions.</p>
<p>Thanks,<br/>{{org.name}}</p>`;

export function SendInvoiceDialog({
  invoiceId,
  toEmail,
  ctx,
  initialSubject,
  initialBody,
  action,
  trigger,
}: {
  invoiceId: string;
  toEmail: string;
  ctx: MergeTagContext;
  initialSubject?: string;
  initialBody?: string;
  action: (input: {
    invoiceId: string;
    subject: string;
    bodyHtml: string;
    scheduledFor?: Date | string | null;
  }) => Promise<unknown>;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [subject, setSubject] = React.useState(initialSubject || DEFAULT_SUBJECT);
  const [body, setBody] = React.useState(initialBody || DEFAULT_BODY);
  const [sendLater, setSendLater] = React.useState(false);
  const [scheduledFor, setScheduledFor] = React.useState<Date | null>(null);

  const previewSubject = React.useMemo(
    () => applyMergeTags(subject, ctx),
    [subject, ctx]
  );
  const previewBody = React.useMemo(
    () => applyMergeTags(body, ctx),
    [body, ctx]
  );

  async function submit() {
    if (sendLater && !scheduledFor) {
      toast.error("Pick a date for the scheduled send");
      return;
    }
    setBusy(true);
    try {
      await action({
        invoiceId,
        subject,
        bodyHtml: body,
        scheduledFor:
          sendLater && scheduledFor
            ? (format(scheduledFor, "yyyy-MM-dd") as unknown as Date)
            : null,
      });
      toast.success(
        sendLater
          ? `Invoice scheduled to send on ${format(scheduledFor!, "dd MMM yyyy")}`
          : "Invoice sent"
      );
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Send invoice via email
          </DialogTitle>
          <DialogDescription>
            To {toEmail}. The invoice PDF + rendered HTML will be attached
            automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Preview: <span className="font-medium">{previewSubject}</span>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">Body</Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={8}
            />
            <p className="text-xs text-muted-foreground">
              Merge tags: <code>{"{{customer.name}}"}</code>,{" "}
              <code>{"{{document.number}}"}</code>,{" "}
              <code>{"{{document.total}}"}</code>,{" "}
              <code>{"{{document.dueDate}}"}</code>,{" "}
              <code>{"{{org.name}}"}</code>
            </p>
          </div>
          <div className="rounded border bg-muted/20 p-3 text-xs">
            <div className="font-semibold mb-1">Body preview</div>
            <div
              className="prose prose-sm max-w-none"
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: previewBody }}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={sendLater}
              onChange={(e) => setSendLater(e.target.checked)}
            />
            Send later
          </label>
          {sendLater ? (
            <div className="space-y-2">
              <Label>Scheduled date</Label>
              <DatePicker value={scheduledFor} onChange={setScheduledFor} />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} className="gap-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {sendLater ? "Schedule send" : "Send now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
