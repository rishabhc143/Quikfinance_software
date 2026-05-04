"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  return (
    <React.Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <ResetPasswordInner />
    </React.Suspense>
  );
}

function ResetPasswordInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") ?? "";
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password"));
    const confirm = String(data.get("confirm"));
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    const r = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setError(j.error ?? "Reset failed");
      return;
    }
    toast.success("Password reset. Sign in to continue.");
    router.push("/login");
  }

  if (!token) return <p className="text-sm text-destructive">Missing or invalid token.</p>;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Updating…" : "Update password"}</Button>
    </form>
  );
}
