"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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

const DEFAULT_SUBJECT =
  "Reminder: Invoice {{document.number}} from {{org.name}}";
const DEFAULT_BODY = `<p>Hello {{customer.name}},</p>
<p>This is a friendly reminder that invoice <strong>{{document.number}}</strong>
for <strong>{{document.total}}</strong> is due on
<strong>{{document.dueDate}}</strong>.</p>
<p>Thank you,<br/>{{org.name}}</p>`;

export function SendReminderDialog({
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
          ? `Reminder scheduled for ${format(scheduledFor!, "dd MMM yyyy")}`
          : "Reminder sent"
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
          <DialogTitle>Send reminder</DialogTitle>
          <DialogDescription>To {toEmail}</DialogDescription>
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
            {sendLater ? "Schedule" : "Send now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
