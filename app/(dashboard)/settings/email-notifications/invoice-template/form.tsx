"use client";

import * as React from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { applyMergeTags, type MergeTagContext } from "@/lib/sales/merge-tags";
import { saveInvoiceEmailTemplateAction } from "./actions";

const HARD_CODED_DEFAULT_SUBJECT =
  "Invoice {{document.number}} from {{org.name}}";
const HARD_CODED_DEFAULT_BODY = `<p>Hello {{customer.name}},</p>
<p>Please find your invoice <strong>{{document.number}}</strong>
attached. The total is <strong>{{document.total}}</strong>, due
<strong>{{document.dueDate}}</strong>.</p>
<p>Let me know if you have any questions.</p>
<p>Thanks,<br/>{{org.name}}</p>`;

/**
 * Dummy merge-tag context used for the live preview pane. Real
 * invoice context is substituted server-side at send time.
 */
const PREVIEW_CTX: MergeTagContext = {
  customerName: "Acme Corp",
  customerEmail: "billing@acme.example",
  documentNumber: "INV-2026-001",
  documentTotal: "₹10,000.00",
  documentDate: "25 May 2026",
  documentDueDate: "10 Jun 2026",
  orgName: "Your Organization",
};

export function InvoiceEmailTemplateForm({
  initialSubject,
  initialBody,
}: {
  initialSubject: string | null;
  initialBody: string | null;
}) {
  const [subject, setSubject] = React.useState(
    initialSubject ?? HARD_CODED_DEFAULT_SUBJECT,
  );
  const [body, setBody] = React.useState(
    initialBody ?? HARD_CODED_DEFAULT_BODY,
  );
  const [busy, setBusy] = React.useState(false);

  const previewSubject = React.useMemo(
    () => applyMergeTags(subject, PREVIEW_CTX),
    [subject],
  );
  const previewBody = React.useMemo(
    () => applyMergeTags(body, PREVIEW_CTX),
    [body],
  );

  async function save() {
    setBusy(true);
    try {
      await saveInvoiceEmailTemplateAction({ subject, body });
      toast.success("Invoice email template saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function resetToDefault() {
    setSubject(HARD_CODED_DEFAULT_SUBJECT);
    setBody(HARD_CODED_DEFAULT_BODY);
  }

  return (
    <div className="space-y-6">
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
        <Label htmlFor="body">Body (HTML)</Label>
        <Textarea
          id="body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          className="font-mono text-xs"
        />
        <p className="text-xs text-muted-foreground">
          Merge tags: <code>{"{{customer.name}}"}</code>,{" "}
          <code>{"{{document.number}}"}</code>,{" "}
          <code>{"{{document.total}}"}</code>,{" "}
          <code>{"{{document.dueDate}}"}</code>,{" "}
          <code>{"{{org.name}}"}</code>
        </p>
      </div>

      <div className="rounded border bg-muted/20 p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
          Live preview
        </div>
        <div className="text-sm font-medium mb-3">{previewSubject}</div>
        <div
          className="prose prose-sm max-w-none"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: previewBody }}
        />
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={busy} className="gap-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save template
        </Button>
        <Button
          variant="ghost"
          onClick={resetToDefault}
          disabled={busy}
          className="gap-1"
          type="button"
        >
          <RotateCcw className="h-4 w-4" /> Reset to default
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Once saved, every &quot;Send via Email&quot; dialog on Invoices
        pre-fills with this template. The Accounts team can still edit the
        text per-send before clicking Send.
      </p>
    </div>
  );
}
