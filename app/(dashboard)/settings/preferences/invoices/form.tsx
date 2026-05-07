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
import type { InvoicePrefs } from "@/lib/sales/preferences";
import { saveInvoicesPrefsAction } from "./actions";

export function InvoicesPrefsForm({
  initial,
  pdfTemplates,
}: {
  initial: InvoicePrefs;
  pdfTemplates: ComboboxOption[];
}) {
  const [busy, setBusy] = React.useState(false);
  const [defaultCustomerNotes, setDefaultCustomerNotes] = React.useState(
    initial.defaultCustomerNotes
  );
  const [defaultTerms, setDefaultTerms] = React.useState(
    initial.defaultTermsAndConditions
  );
  const [defaultNetDays, setDefaultNetDays] = React.useState(
    String(initial.defaultNetDays)
  );
  const [reminderBeforeDays, setReminderBeforeDays] = React.useState(
    String(initial.reminderBeforeDays)
  );
  const [reminderAfterDays, setReminderAfterDays] = React.useState(
    String(initial.reminderAfterDays)
  );
  const [autoCharge, setAutoCharge] = React.useState(initial.autoChargeCustomer);
  const [pdfTemplateId, setPdfTemplateId] = React.useState<string | null>(
    initial.defaultPdfTemplateId
  );
  const [emailSubject, setEmailSubject] = React.useState(initial.emailSubject);
  const [emailBody, setEmailBody] = React.useState(initial.emailBody);
  const [fv, setFv] = React.useState(initial.fieldVisibility);

  async function submit() {
    setBusy(true);
    try {
      await saveInvoicesPrefsAction({
        defaultCustomerNotes,
        defaultTermsAndConditions: defaultTerms,
        defaultNetDays: Number(defaultNetDays || 30),
        reminderBeforeDays: Number(reminderBeforeDays || 3),
        reminderAfterDays: Number(reminderAfterDays || 7),
        autoChargeCustomer: autoCharge,
        defaultPdfTemplateId: pdfTemplateId,
        emailSubject,
        emailBody,
        fieldVisibility: fv,
      });
      toast.success("Invoice preferences saved");
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
              placeholder="Thanks for your business!"
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
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="net-days">Default Net days</Label>
              <Input
                id="net-days"
                inputMode="numeric"
                value={defaultNetDays}
                onChange={(e) => setDefaultNetDays(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminder-before">Reminder X days before due</Label>
              <Input
                id="reminder-before"
                inputMode="numeric"
                value={reminderBeforeDays}
                onChange={(e) => setReminderBeforeDays(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reminder-after">Reminder Y days after due</Label>
              <Input
                id="reminder-after"
                inputMode="numeric"
                value={reminderAfterDays}
                onChange={(e) => setReminderAfterDays(e.target.value)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={autoCharge}
              onCheckedChange={setAutoCharge}
              disabled
              aria-disabled
            />
            <span className="text-muted-foreground">
              Auto-charge customer (configure payment method on customer — coming soon)
            </span>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Field customization (New Invoice form)
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
              placeholder="Standard Invoice"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-subject">Email subject</Label>
            <Input
              id="email-subject"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Invoice {{document.number}} from {{org.name}}"
            />
            <p className="text-xs text-muted-foreground">
              Merge tags: <code>{"{{customer.name}}"}</code> ·{" "}
              <code>{"{{document.number}}"}</code> ·{" "}
              <code>{"{{document.total}}"}</code> ·{" "}
              <code>{"{{document.dueDate}}"}</code>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-body">Email body</Label>
            <Textarea
              id="email-body"
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={5}
              placeholder="Hello {{customer.name}}, your invoice {{document.number}} for {{document.total}} is due on {{document.dueDate}}."
            />
          </div>
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
