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

/**
 * Save & Send modal — shared by Quote / Sales Order / Invoice "Send"
 * flows on the detail page. Per <quotes_spec> the modal lets the user
 * edit To / Cc / Subject / Body, toggle "Attach PDF", and choose
 * "Send Now" or "Send Later" with a date.
 */
export function SaveAndSendDialog({
  documentId,
  documentLabel,
  toEmail,
  ccEmails,
  ctx,
  initialSubject,
  initialBody,
  pdfHref,
  action,
  trigger,
}: {
  documentId: string;
  documentLabel: string;
  toEmail: string;
  ccEmails?: string[];
  ctx: MergeTagContext;
  initialSubject?: string;
  initialBody?: string;
  /** Public link the merchant can show in the body (M10 may inline a PDF
   *  attachment URL; for v1 we just include it as a "view document" link). */
  pdfHref?: string;
  action: (input: {
    documentId: string;
    to: string;
    cc?: string[];
    subject: string;
    bodyHtml: string;
    attachPdf: boolean;
    scheduledFor?: Date | string | null;
  }) => Promise<unknown>;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [to, setTo] = React.useState(toEmail);
  const [ccText, setCcText] = React.useState((ccEmails ?? []).join(", "));
  const [subject, setSubject] = React.useState(
    initialSubject ?? `${documentLabel} {{document.number}} from {{org.name}}`
  );
  const [body, setBody] = React.useState(
    initialBody ??
      `<p>Hello {{customer.name}},</p>\n<p>Please find your ${documentLabel.toLowerCase()} <strong>{{document.number}}</strong> attached.</p>\n${pdfHref ? `<p><a href="${pdfHref}">View document</a></p>` : ""}\n<p>Thank you,<br/>{{org.name}}</p>`
  );
  const [attachPdf, setAttachPdf] = React.useState(true);
  const [sendLater, setSendLater] = React.useState(false);
  const [scheduledFor, setScheduledFor] = React.useState<Date | null>(null);

  const previewSubject = applyMergeTags(subject, ctx);
  const previewBody = applyMergeTags(body, ctx);

  async function submit() {
    if (!to.trim()) {
      toast.error("To address required");
      return;
    }
    if (sendLater && !scheduledFor) {
      toast.error("Pick a date for the scheduled send");
      return;
    }
    setBusy(true);
    try {
      const cc = ccText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await action({
        documentId,
        to,
        cc: cc.length ? cc : undefined,
        subject,
        bodyHtml: body,
        attachPdf,
        scheduledFor:
          sendLater && scheduledFor
            ? (format(scheduledFor, "yyyy-MM-dd") as unknown as Date)
            : null,
      });
      toast.success(
        sendLater
          ? `Scheduled for ${format(scheduledFor!, "dd MMM yyyy")}`
          : "Sent"
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
          <DialogTitle>Send {documentLabel.toLowerCase()}</DialogTitle>
          <DialogDescription>{previewSubject}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="to">To</Label>
              <Input id="to" type="email" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cc">Cc (comma-separated)</Label>
              <Input id="cc" value={ccText} onChange={(e) => setCcText(e.target.value)} />
            </div>
          </div>
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
              rows={6}
            />
            <p className="text-xs text-muted-foreground">
              Merge tags: <code>{"{{customer.name}}"}</code> ·{" "}
              <code>{"{{document.number}}"}</code> ·{" "}
              <code>{"{{document.total}}"}</code> ·{" "}
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
              checked={attachPdf}
              onChange={(e) => setAttachPdf(e.target.checked)}
            />
            Attach PDF of the {documentLabel.toLowerCase()}
          </label>
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
