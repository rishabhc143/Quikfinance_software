"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveProfileAction } from "./actions";
import { toast } from "sonner";

const COUNTRIES = [
  { code: "IN", name: "India" }, { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" }, { code: "AE", name: "United Arab Emirates" },
  { code: "SG", name: "Singapore" }, { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" }, { code: "DE", name: "Germany" },
];

const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD", "JPY"];
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(2024, i, 1).toLocaleString("en", { month: "long" }) }));

export function ProfileForm({
  initial,
}: { initial: { name: string; slug: string; country: string; currency: string; fiscalYearStart: number; logoUrl: string | null } }) {
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
      await saveProfileAction(values);
      toast.success("Profile saved");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Organization name" required>
          <Input value={values.name} onChange={(e) => set("name", e.target.value)} required minLength={2} />
        </Field>
        <Field label="Slug" hint="Lowercase letters, numbers, hyphens. Used in URLs.">
          <Input value={values.slug} onChange={(e) => set("slug", e.target.value)} pattern="[a-z0-9-]+" required />
        </Field>
        <Field label="Country">
          <select
            value={values.country}
            onChange={(e) => set("country", e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Currency">
          <select
            value={values.currency}
            onChange={(e) => set("currency", e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Fiscal year starts">
          <select
            value={values.fiscalYearStart}
            onChange={(e) => set("fiscalYearStart", Number(e.target.value))}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Logo URL" hint="Public URL of your logo (PNG/JPG/SVG). Branding upload comes in Phase 4.">
          <Input value={values.logoUrl ?? ""} onChange={(e) => set("logoUrl", e.target.value || null)} placeholder="https://…" type="url" />
        </Field>
      </div>
      <div className="flex justify-end pt-2 border-t">
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save changes
        </Button>
      </div>
    </form>
  );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
