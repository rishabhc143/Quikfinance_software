"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { toast } from "sonner";
import type { QuotePrefs } from "@/lib/sales/preferences";
import { saveQuotesPrefsAction } from "./actions";

export function QuotesPrefsForm({
  initial,
  pdfTemplates,
}: {
  initial: QuotePrefs;
  pdfTemplates: ComboboxOption[];
}) {
  const [busy, setBusy] = React.useState(false);
  const [defaultCustomerNotes, setDefaultCustomerNotes] = React.useState(
    initial.defaultCustomerNotes
  );
  const [defaultTerms, setDefaultTerms] = React.useState(
    initial.defaultTermsAndConditions
  );
  const [defaultExpiryDays, setDefaultExpiryDays] = React.useState(
    String(initial.defaultExpiryDays)
  );
  const [allowOnline, setAllowOnline] = React.useState(initial.allowOnlineAcceptDecline);
  const [notifyAccepted, setNotifyAccepted] = React.useState(initial.notifyOnAccepted);
  const [notifyDeclined, setNotifyDeclined] = React.useState(initial.notifyOnDeclined);
  const [pdfTemplateId, setPdfTemplateId] = React.useState<string | null>(
    initial.defaultPdfTemplateId
  );
  const [emailSubject, setEmailSubject] = React.useState(initial.emailSubject);
  const [emailBody, setEmailBody] = React.useState(initial.emailBody);
  const [fv, setFv] = React.useState(initial.fieldVisibility);

  async function submit() {
    setBusy(true);
    try {
      await saveQuotesPrefsAction({
        defaultCustomerNotes,
        defaultTermsAndConditions: defaultTerms,
        defaultExpiryDays: Number(defaultExpiryDays || 30),
        allowOnlineAcceptDecline: allowOnline,
        notifyOnAccepted: notifyAccepted,
        notifyOnDeclined: notifyDeclined,
        defaultPdfTemplateId: pdfTemplateId,
        emailSubject,
        emailBody,
        fieldVisibility: fv,
      });
      toast.success("Quotes preferences saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Defaults
          </h2>
          <div className="space-y-2">
            <Label htmlFor="customer-notes">Default Customer Notes</Label>
            <Textarea
              id="customer-notes"
              value={defaultCustomerNotes}
              onChange={(e) => setDefaultCustomerNotes(e.target.value)}
              rows={3}
              placeholder="Looking forward to your business."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="terms">Default Terms &amp; Conditions</Label>
            <Textarea
              id="terms"
              value={defaultTerms}
              onChange={(e) => setDefaultTerms(e.target.value)}
              rows={3}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expiry-days">Default expiry (days)</Label>
              <Input
                id="expiry-days"
                inputMode="numeric"
                value={defaultExpiryDays}
                onChange={(e) => setDefaultExpiryDays(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={allowOnline} onCheckedChange={setAllowOnline} />
            Allow customers to accept/decline online
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={notifyAccepted} onCheckedChange={setNotifyAccepted} />
            Notify me when a quote is accepted
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={notifyDeclined} onCheckedChange={setNotifyDeclined} />
            Notify me when a quote is declined
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Field customization (New Quote form)
          </h2>
          {(["reference", "project", "salesperson", "subject"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <Switch
                checked={fv[k]}
                onCheckedChange={(v) => setFv({ ...fv, [k]: v })}
              />
              Show <span className="font-medium capitalize">{k}</span> field
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            Field-visibility wiring on the New Quote form ships with the form-polish batch (M10).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Templates
          </h2>
          <div className="space-y-2">
            <Label>Default PDF template</Label>
            <Combobox
              options={pdfTemplates}
              value={pdfTemplateId}
              onChange={(v) => setPdfTemplateId(v)}
              placeholder="Standard Quote"
            />
            <p className="text-xs text-muted-foreground">
              Need to add or edit templates? Visit <a className="underline" href="/settings/pdf-templates">PDF templates</a>.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-subject">Email subject</Label>
            <Input
              id="email-subject"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Quote {{document.number}} from {{org.name}}"
            />
            <p className="text-xs text-muted-foreground">
              Merge tags: <code>{"{{customer.name}}"}</code> ·{" "}
              <code>{"{{document.number}}"}</code> ·{" "}
              <code>{"{{document.total}}"}</code> ·{" "}
              <code>{"{{org.name}}"}</code>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-body">Email body</Label>
            <Textarea
              id="email-body"
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={5}
              placeholder="Hello {{customer.name}}, please find your quote attached."
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Number series for quote numbering live at{" "}
            <a className="underline" href="/settings/number-series">/settings/number-series</a>.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={busy} className="gap-1">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save preferences
        </Button>
      </div>
    </div>
  );
}
