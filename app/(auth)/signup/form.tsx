"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const COUNTRIES = [
  { code: "IN", name: "India", currency: "INR" },
  { code: "US", name: "United States", currency: "USD" },
  { code: "GB", name: "United Kingdom", currency: "GBP" },
  { code: "AE", name: "United Arab Emirates", currency: "AED" },
  { code: "SG", name: "Singapore", currency: "SGD" },
  { code: "AU", name: "Australia", currency: "AUD" },
  { code: "CA", name: "Canada", currency: "CAD" },
];

export function SignupForm() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [country, setCountry] = React.useState("IN");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const payload = {
      name: String(data.get("name")),
      email: String(data.get("email")),
      password: String(data.get("password")),
      country,
      currency: COUNTRIES.find((c) => c.code === country)?.currency ?? "INR",
    };
    setBusy(true);
    try {
      const r = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await r.json();
      if (!r.ok || !json.ok) {
        setError(json.error ?? "Signup failed");
        return;
      }
      toast.success("Account created. Check your email to verify.");
      router.push("/verify-email?status=sent");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field label="Full name" name="name" type="text" required minLength={2} autoComplete="name" />
      <Field label="Work email" name="email" type="email" required autoComplete="email" />
      <Field label="Password" name="password" type="password" required minLength={8} autoComplete="new-password" hint="At least 8 characters" />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="country">Country</Label>
          <select
            id="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Input value={COUNTRIES.find((c) => c.code === country)?.currency ?? "INR"} readOnly />
        </div>
      </div>
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input type="checkbox" required className="mt-0.5" />
        <span>I agree to the <a href="/terms" className="underline">terms</a> and <a href="/privacy" className="underline">privacy policy</a>.</span>
      </label>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Creating account…" : "Create account"}</Button>
    </form>
  );
}

function Field({ label, name, type, required, minLength, autoComplete, hint }: { label: string; name: string; type: string; required?: boolean; minLength?: number; autoComplete?: string; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} minLength={minLength} autoComplete={autoComplete} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
