"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveProfileAction } from "./actions";
import { toast } from "sonner";
import { gstinErrors } from "@/lib/validators/gstin";

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
}: {
  initial: {
    name: string;
    slug: string;
    country: string;
    currency: string;
    fiscalYearStart: number;
    gstin: string;
    address: string;
    phoneNumber: string;
    email: string;
    logoUrl: string | null;
  };
}) {
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
        <Field
          label="GSTIN"
          hint="Indian Goods & Services Tax ID. Required for GSTR-1 export and e-invoicing."
        >
          <Input
            value={values.gstin}
            onChange={(e) => set("gstin", e.target.value.toUpperCase())}
            placeholder="22AAAAA0000A1Z5"
            className="uppercase font-mono"
            maxLength={15}
          />
          <GstinHint value={values.gstin} />
        </Field>
        <Field
          label="Address"
          hint="Free-form multi-line. Appears on every invoice PDF below the organisation name."
        >
          <textarea
            value={values.address}
            onChange={(e) => set("address", e.target.value)}
            placeholder={"465 Saikiripa Colony Indore\nIndore Madhya Pradesh 452010\nIndia"}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </Field>
        <Field
          label="Phone"
          hint="Shown on the invoice PDF for customer reference."
        >
          <Input
            value={values.phoneNumber}
            onChange={(e) => set("phoneNumber", e.target.value)}
            placeholder="9399771515"
            type="tel"
          />
        </Field>
        <Field
          label="Email"
          hint="Shown on the invoice PDF — typically accounts@yourdomain.com."
        >
          <Input
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="accounts@yourdomain.com"
            type="email"
          />
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

function GstinHint({ value }: { value: string }) {
  const v = (value ?? "").trim();
  if (v.length === 0) return null;
  const errors = gstinErrors(v);
  if (errors.length === 0) {
    return (
      <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
        ✓ Valid GSTIN format
      </p>
    );
  }
  return (
    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
      {errors[0]}
    </p>
  );
}
