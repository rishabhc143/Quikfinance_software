"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { saveEmailPrefsAction } from "./actions";
import { toast } from "sonner";

type Prefs = {
  emailOnInvoiceSent: boolean;
  emailOnInvoicePaid: boolean;
  emailOnBillDue: boolean;
  emailOnPaymentReceived: boolean;
  emailOnEstimateAccepted: boolean;
  emailDigestWeekly: boolean;
};

const ROWS: Array<{ key: keyof Prefs; title: string; sub: string }> = [
  { key: "emailOnInvoiceSent", title: "Invoice sent", sub: "When an invoice is sent to a customer." },
  { key: "emailOnInvoicePaid", title: "Invoice paid", sub: "When a customer pays an invoice in full." },
  { key: "emailOnPaymentReceived", title: "Payment received", sub: "When a payment is recorded against any invoice." },
  { key: "emailOnBillDue", title: "Bill due", sub: "Reminder when a vendor bill approaches its due date." },
  { key: "emailOnEstimateAccepted", title: "Estimate / quote accepted", sub: "When a customer accepts a quote." },
  { key: "emailDigestWeekly", title: "Weekly digest", sub: "Monday summary of activity, receivables, and payables." },
];

export function EmailNotificationsForm({ initial }: { initial: Prefs }) {
  const router = useRouter();
  const [prefs, setPrefs] = React.useState<Prefs>(initial);
  const [busy, setBusy] = React.useState(false);

  async function toggle(key: keyof Prefs, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setBusy(true);
    try {
      await saveEmailPrefsAction(next);
      toast.success("Updated");
      router.refresh();
    } catch (err) {
      setPrefs(prefs);
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="divide-y">
      {ROWS.map((r) => (
        <div key={r.key} className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <Label className="text-sm font-medium block">{r.title}</Label>
            <p className="text-xs text-muted-foreground">{r.sub}</p>
          </div>
          <Switch checked={prefs[r.key]} onCheckedChange={(v) => toggle(r.key, v)} disabled={busy} />
        </div>
      ))}
    </div>
  );
}
