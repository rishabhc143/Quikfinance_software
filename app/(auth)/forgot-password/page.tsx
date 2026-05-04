"use client";

import * as React from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function ForgotPasswordPage() {
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const data = new FormData(e.currentTarget);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: String(data.get("email")) }),
    });
    setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="text-sm text-muted-foreground">If that email is registered, we sent a password reset link. The link expires in 30 minutes.</p>
        <Link href="/login" className="text-sm text-primary hover:underline">Back to sign in</Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Reset password</h1>
        <p className="text-sm text-muted-foreground">Enter the email associated with your account.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</Button>
      <Link href="/login" className="text-sm text-primary hover:underline block text-center">Back to sign in</Link>
    </form>
  );
}
