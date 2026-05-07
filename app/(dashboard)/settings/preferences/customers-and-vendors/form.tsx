"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { toast } from "sonner";
import type { CustomerPrefs } from "@/lib/sales/preferences";
import { saveCustomerPrefsAction } from "./actions";

export function CustomersPrefsForm({
  initial,
  paymentTerms,
}: {
  initial: CustomerPrefs;
  paymentTerms: ComboboxOption[];
}) {
  const [busy, setBusy] = React.useState(false);
  const [defaultCurrency, setDefaultCurrency] = React.useState(initial.defaultCurrency);
  const [defaultPaymentTermsId, setDefaultPaymentTermsId] = React.useState<
    string | null
  >(initial.defaultPaymentTermsId);
  const [showSalutation, setShowSalutation] = React.useState(initial.showSalutation);
  const [showCustomerOwner, setShowCustomerOwner] = React.useState(
    initial.showCustomerOwner
  );

  async function submit() {
    setBusy(true);
    try {
      await saveCustomerPrefsAction({
        defaultCurrency,
        defaultPaymentTermsId,
        showSalutation,
        showCustomerOwner,
      });
      toast.success("Customer preferences saved");
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
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="currency">Default currency</Label>
              <Input
                id="currency"
                value={defaultCurrency}
                onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase())}
                placeholder="INR"
                maxLength={8}
              />
            </div>
            <div className="space-y-2">
              <Label>Default payment terms</Label>
              <Combobox
                options={paymentTerms}
                value={defaultPaymentTermsId}
                onChange={(v) => setDefaultPaymentTermsId(v)}
                placeholder="Due on Receipt"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Field customization (New Customer form)
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showSalutation} onCheckedChange={setShowSalutation} />
            Show salutation field
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={showCustomerOwner}
              onCheckedChange={setShowCustomerOwner}
            />
            Show Customer Owner picker
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          <p>
            Custom-fields configuration (per-customer extensible fields) ships
            in a separate batch. The Custom Fields tab on each customer
            currently shows a placeholder until that lands.
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
