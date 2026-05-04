"use client";

import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { loginAction, googleSignInAction } from "./actions";

const initialState: { error: string | null } = { error: null };

export function LoginForm() {
  const [state, formAction] = useFormState(loginAction, initialState);
  return (
    <div className="space-y-4">
      <form action={googleSignInAction}>
        <Button type="submit" variant="outline" className="w-full">
          <GoogleIcon className="h-4 w-4 mr-2" /> Sign in with Google
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="flex-1 h-px bg-border" /> OR <div className="flex-1 h-px bg-border" />
      </div>

      <form action={formAction} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between">
            <Label htmlFor="password">Password</Label>
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">Forgot password?</Link>
          </div>
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state?.error && <p className="text-sm text-destructive" role="alert">{state.error}</p>}
        <SubmitButton />
      </form>
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return <Button type="submit" className="w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>;
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#EA4335" d="M12 5.04c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 1.69 14.97.65 12 .65 7.32.65 3.27 3.32 1.31 7.21l3.66 2.84C5.93 7.05 8.74 5.04 12 5.04z"/>
      <path fill="#4285F4" d="M23.49 12.27c0-.86-.08-1.68-.21-2.47H12v4.69h6.45c-.28 1.5-1.12 2.78-2.39 3.63l3.65 2.84c2.13-1.97 3.78-4.86 3.78-8.69z"/>
      <path fill="#FBBC05" d="M4.97 14.7l-.85.65-3 2.34C2.94 21.05 7.13 23.35 12 23.35c2.97 0 5.45-.98 7.27-2.66l-3.65-2.84c-1 .67-2.27 1.07-3.62 1.07-3.26 0-6.07-2.01-7.03-4.93z"/>
      <path fill="#34A853" d="M12 23.35c4.87 0 9.06-2.3 11.88-6.35L20.23 14.16C19.27 17.08 16.46 19.09 12 19.09S5.93 17.08 4.97 14.16L1.31 16.99C3.27 20.88 7.32 23.35 12 23.35z"/>
    </svg>
  );
}
