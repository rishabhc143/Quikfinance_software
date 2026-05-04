"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveGeneralAction } from "./actions";
import { toast } from "sonner";

const TIME_ZONES = [
  "Asia/Kolkata", "Asia/Dubai", "Asia/Singapore", "Europe/London", "Europe/Berlin",
  "America/New_York", "America/Los_Angeles", "America/Chicago", "Australia/Sydney", "UTC",
];
const DATE_FORMATS = ["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "dd MMM yyyy"];
const DECIMAL_FORMATS = ["1234567.89", "1,234,567.89", "1.234.567,89"];
const LANGUAGES = [["en", "English"], ["hi", "Hindi"], ["es", "Spanish"], ["fr", "French"], ["de", "German"]] as const;

export function GeneralForm({
  initial,
}: { initial: { decimalFormat: string; dateFormat: string; timeZone: string; language: string } }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [values, setValues] = React.useState(initial);

  function set<K extends keyof typeof values>(k: K, v: (typeof values)[K]) {
    setValues((s) => ({ ...s, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await saveGeneralAction(values);
      toast.success("General settings saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Time zone">
          <select value={values.timeZone} onChange={(e) => set("timeZone", e.target.value)} className="select">
            {TIME_ZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
          </select>
        </Field>
        <Field label="Language">
          <select value={values.language} onChange={(e) => set("language", e.target.value)} className="select">
            {LANGUAGES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </Field>
        <Field label="Date format">
          <select value={values.dateFormat} onChange={(e) => set("dateFormat", e.target.value)} className="select">
            {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
        <Field label="Decimal format">
          <select value={values.decimalFormat} onChange={(e) => set("decimalFormat", e.target.value)} className="select">
            {DECIMAL_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>
      </div>
      <div className="flex justify-end pt-2 border-t">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save changes
        </Button>
      </div>
      <style>{`.select { display:flex; height:2.5rem; width:100%; border-radius:0.375rem; border:1px solid hsl(var(--input)); background:hsl(var(--background)); padding:0 0.75rem; font-size:0.875rem; }`}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label>{label}</Label>{children}</div>;
}
