"use client";

import * as React from "react";
import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  loginAction,
  magicLinkSignInAction,
  googleSignInAction,
  microsoftSignInAction,
  githubSignInAction,
} from "./actions";
import type { EnabledProviders } from "@/lib/auth";

const credentialsInitialState: { error: string | null } = { error: null };
const magicLinkInitialState: { error: string | null } = { error: null };

export function LoginForm({
  enabledProviders,
}: {
  enabledProviders: EnabledProviders;
}) {
  const [credState, credAction] = useFormState(
    loginAction,
    credentialsInitialState,
  );
  const [magicState, magicAction] = useFormState(
    magicLinkSignInAction,
    magicLinkInitialState,
  );
  const [showPassword, setShowPassword] = React.useState(false);
  const anyOauth =
    enabledProviders.google ||
    enabledProviders.microsoft ||
    enabledProviders.github;

  return (
    <div className="space-y-4">
      {/* Magic-link: paste any email, get a sign-in link */}
      {enabledProviders.resend ? (
        <form action={magicAction} className="space-y-2">
          <Label htmlFor="magic-email" className="text-sm font-medium">
            Sign in with email
          </Label>
          <div className="flex gap-2">
            <Input
              id="magic-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              required
              className="flex-1"
            />
            <MagicLinkSubmit />
          </div>
          {magicState?.error && (
            <p className="text-sm text-destructive" role="alert">
              {magicState.error}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            We&apos;ll email you a one-click sign-in link. No password needed.
          </p>
        </form>
      ) : null}

      {/* OAuth buttons (only those whose env vars are set) */}
      {anyOauth ? (
        <>
          {enabledProviders.resend ? (
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div className="flex-1 h-px bg-border" /> OR{" "}
              <div className="flex-1 h-px bg-border" />
            </div>
          ) : null}
          <div className="space-y-2">
            {enabledProviders.google ? (
              <form action={googleSignInAction}>
                <Button type="submit" variant="outline" className="w-full">
                  <GoogleIcon className="h-4 w-4 mr-2" /> Continue with Google
                </Button>
              </form>
            ) : null}
            {enabledProviders.microsoft ? (
              <form action={microsoftSignInAction}>
                <Button type="submit" variant="outline" className="w-full">
                  <MicrosoftIcon className="h-4 w-4 mr-2" /> Continue with
                  Microsoft
                </Button>
              </form>
            ) : null}
            {enabledProviders.github ? (
              <form action={githubSignInAction}>
                <Button type="submit" variant="outline" className="w-full">
                  <GitHubIcon className="h-4 w-4 mr-2" /> Continue with GitHub
                </Button>
              </form>
            ) : null}
          </div>
        </>
      ) : null}

      {/* Password fallback (collapsible) */}
      <div className="pt-2">
        {!showPassword ? (
          <button
            type="button"
            onClick={() => setShowPassword(true)}
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Use a password instead
          </button>
        ) : (
          <form action={credAction} className="space-y-3 pt-2 border-t">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {credState?.error && (
              <p className="text-sm text-destructive" role="alert">
                {credState.error}
              </p>
            )}
            <PasswordSubmit />
          </form>
        )}
      </div>
    </div>
  );
}

function MagicLinkSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Sending…" : "Send link"}
    </Button>
  );
}

function PasswordSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Signing in…" : "Sign in"}
    </Button>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M12 5.04c1.62 0 3.07.56 4.21 1.64l3.15-3.15C17.45 1.69 14.97.65 12 .65 7.32.65 3.27 3.32 1.31 7.21l3.66 2.84C5.93 7.05 8.74 5.04 12 5.04z"
      />
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.86-.08-1.68-.21-2.47H12v4.69h6.45c-.28 1.5-1.12 2.78-2.39 3.63l3.65 2.84c2.13-1.97 3.78-4.86 3.78-8.69z"
      />
      <path
        fill="#FBBC05"
        d="M4.97 14.7l-.85.65-3 2.34C2.94 21.05 7.13 23.35 12 23.35c2.97 0 5.45-.98 7.27-2.66l-3.65-2.84c-1 .67-2.27 1.07-3.62 1.07-3.26 0-6.07-2.01-7.03-4.93z"
      />
      <path
        fill="#34A853"
        d="M12 23.35c4.87 0 9.06-2.3 11.88-6.35L20.23 14.16C19.27 17.08 16.46 19.09 12 19.09S5.93 17.08 4.97 14.16L1.31 16.99C3.27 20.88 7.32 23.35 12 23.35z"
      />
    </svg>
  );
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#F25022" d="M1 1h10v10H1z" />
      <path fill="#7FBA00" d="M13 1h10v10H13z" />
      <path fill="#00A4EF" d="M1 13h10v10H1z" />
      <path fill="#FFB900" d="M13 13h10v10H13z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55v-1.94c-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.73-1.54-2.55-.29-5.23-1.28-5.23-5.69 0-1.26.45-2.29 1.19-3.1-.12-.3-.51-1.47.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 015.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.12 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .3.21.66.79.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}
