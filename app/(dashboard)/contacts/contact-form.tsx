"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Type = "CUSTOMER" | "VENDOR" | "BOTH";

export type ContactFormValues = {
  type: Type;
  displayName: string;
  companyName: string;
  email: string;
  phone: string;
  billingAddress: string;
  shippingAddress: string;
  taxId: string;
  currency: string;
  notes: string;
};

const blank: ContactFormValues = {
  type: "CUSTOMER", displayName: "", companyName: "", email: "", phone: "",
  billingAddress: "", shippingAddress: "", taxId: "", currency: "", notes: "",
};

export function ContactForm({
  initial = blank, onSubmit, submitLabel = "Save",
}: { initial?: Partial<ContactFormValues>; onSubmit: (formData: FormData) => Promise<void>; submitLabel?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [v, setV] = React.useState<ContactFormValues>({ ...blank, ...initial });
  function set<K extends keyof ContactFormValues>(k: K, val: ContactFormValues[K]) { setV((s) => ({ ...s, [k]: val })); }

  async function handle(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!v.displayName.trim()) { toast.error("Display name is required"); return; }
    const fd = new FormData();
    Object.entries(v).forEach(([k, val]) => fd.set(k, String(val)));
    setBusy(true);
    try { await onSubmit(fd); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Save failed"); setBusy(false); }
  }

  return (
    <form onSubmit={handle} className="space-y-5">
      <div>
        <Label>Type</Label>
        <div className="flex items-center gap-4 mt-1.5 text-sm">
          {(["CUSTOMER", "VENDOR", "BOTH"] as const).map((t) => (
            <label key={t} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={v.type === t} onChange={() => set("type", t)} />
              {t === "BOTH" ? "Customer + Vendor" : t.charAt(0) + t.slice(1).toLowerCase()}
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Display name" required><Input value={v.displayName} onChange={(e) => set("displayName", e.target.value)} required /></Field>
        <Field label="Company name"><Input value={v.companyName} onChange={(e) => set("companyName", e.target.value)} /></Field>
        <Field label="Email"><Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Phone"><Input value={v.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Tax ID / GSTIN"><Input value={v.taxId} onChange={(e) => set("taxId", e.target.value)} /></Field>
        <Field label="Currency override" hint="Leave blank to use the org's primary currency"><Input value={v.currency} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={4} /></Field>
        <Field label="Billing address" className="md:col-span-2"><Textarea rows={2} value={v.billingAddress} onChange={(e) => set("billingAddress", e.target.value)} /></Field>
        <Field label="Shipping address" className="md:col-span-2"><Textarea rows={2} value={v.shippingAddress} onChange={(e) => set("shippingAddress", e.target.value)} /></Field>
        <Field label="Notes" className="md:col-span-2"><Textarea rows={3} value={v.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="outline" onClick={() => router.push("/contacts")} disabled={busy}>Cancel</Button>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function Field({ label, hint, required, className, children }: { label: string; hint?: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={className}>
      <Label>{label}{required && <span className="text-destructive ml-0.5">*</span>}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
