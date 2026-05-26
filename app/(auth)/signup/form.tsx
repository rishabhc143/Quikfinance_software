"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Invite = {
  token: string;
  email: string;
  organizationName: string;
};

/**
 * Minimal signup form: name + email + password. Country/currency
 * default to IN/INR server-side (see app/api/auth/signup/route.ts);
 * users can change them later in Settings → Organization. The
 * terms acknowledgement is a passive line below the button (not a
 * blocking checkbox) — we still link the policies, but don't gate
 * signup on a click.
 *
 * Most users won't see this form at all — they'll just paste an
 * email on /login and use magic-link. Signup stays here for users
 * who explicitly want to pick a password upfront.
 */
export function SignupForm({ invite }: { invite?: Invite | null }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      name: String(data.get("name")),
      email: invite ? invite.email : String(data.get("email")),
      password: String(data.get("password")),
      // Country + currency default server-side to IN / INR. Users
      // change them later in settings — no need to ask upfront.
    };
    if (invite) {
      payload.inviteToken = invite.token;
    }
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
      if (invite) {
        // Invited users skip email verification — log them in
        // directly. Sign in via the password they just set.
        toast.success(`Welcome to ${invite.organizationName}!`);
        router.push("/login?from=%2F&just-joined=1");
      } else {
        toast.success("Account created. Check your email to verify.");
        router.push("/verify-email?status=sent");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Field
        label="Full name"
        name="name"
        type="text"
        required
        minLength={2}
        autoComplete="name"
      />
      {invite ? (
        <div className="space-y-1.5">
          <Label htmlFor="email-readonly">Work email</Label>
          <Input
            id="email-readonly"
            type="email"
            value={invite.email}
            readOnly
            className="bg-muted"
          />
          <p className="text-xs text-muted-foreground">
            Invitation email — can&apos;t be changed.
          </p>
        </div>
      ) : (
        <Field
          label="Email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      )}
      <Field
        label="Password"
        name="password"
        type="password"
        required
        minLength={8}
        autoComplete="new-password"
        hint="At least 8 characters"
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy
          ? "Creating account…"
          : invite
            ? `Accept invitation & join ${invite.organizationName}`
            : "Create account"}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        By continuing, you agree to our{" "}
        <a href="/terms" className="underline">
          terms
        </a>{" "}
        and{" "}
        <a href="/privacy" className="underline">
          privacy policy
        </a>
        .
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type,
  required,
  minLength,
  autoComplete,
  hint,
}: {
  label: string;
  name: string;
  type: string;
  required?: boolean;
  minLength?: number;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
