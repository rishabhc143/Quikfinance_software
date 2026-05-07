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
import type { SalesOrderPrefs } from "@/lib/sales/preferences";
import { saveSalesOrdersPrefsAction } from "./actions";

export function SalesOrdersPrefsForm({
  initial,
  pdfTemplates,
}: {
  initial: SalesOrderPrefs;
  pdfTemplates: ComboboxOption[];
}) {
  const [busy, setBusy] = React.useState(false);
  const [defaultCustomerNotes, setDefaultCustomerNotes] = React.useState(
    initial.defaultCustomerNotes
  );
  const [defaultTerms, setDefaultTerms] = React.useState(
    initial.defaultTermsAndConditions
  );
  const [defaultExpectedShipmentDays, setDefaultExpectedShipmentDays] =
    React.useState(String(initial.defaultExpectedShipmentDays));
  const [pdfTemplateId, setPdfTemplateId] = React.useState<string | null>(
    initial.defaultPdfTemplateId
  );
  const [emailSubject, setEmailSubject] = React.useState(initial.emailSubject);
  const [emailBody, setEmailBody] = React.useState(initial.emailBody);
  const [fv, setFv] = React.useState(initial.fieldVisibility);

  async function submit() {
    setBusy(true);
    try {
      await saveSalesOrdersPrefsAction({
        defaultCustomerNotes,
        defaultTermsAndConditions: defaultTerms,
        defaultExpectedShipmentDays: Number(defaultExpectedShipmentDays || 7),
        defaultPdfTemplateId: pdfTemplateId,
        emailSubject,
        emailBody,
        fieldVisibility: fv,
      });
      toast.success("Sales Order preferences saved");
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
              <Label htmlFor="ship-days">Default expected shipment (days)</Label>
              <Input
                id="ship-days"
                inputMode="numeric"
                value={defaultExpectedShipmentDays}
                onChange={(e) => setDefaultExpectedShipmentDays(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Field customization (New Sales Order form)
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
              placeholder="Standard Sales Order"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-subject">Email subject</Label>
            <Input
              id="email-subject"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Merge tags: <code>{"{{customer.name}}"}</code> ·{" "}
              <code>{"{{document.number}}"}</code> ·{" "}
              <code>{"{{document.total}}"}</code>
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email-body">Email body</Label>
            <Textarea
              id="email-body"
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={5}
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
