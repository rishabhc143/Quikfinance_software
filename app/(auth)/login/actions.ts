"use server";

import { signIn, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginState = { error: string | null };

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };

  try {
    await signIn("credentials", { ...parsed.data, redirectTo: "/" });
  } catch (err) {
    if (err instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw err;
  }
  return { error: null };
}

/**
 * Magic-link / passwordless login. The user enters an email, we send
 * them a one-click sign-in link via Resend. New users are auto-created
 * on first link click; `requireOrganization()` then redirects them to
 * `/organizations/new` for org setup.
 *
 * NextAuth handles the redirect to `/verify-email?status=sent` (the
 * `verifyRequest` page configured in lib/auth.ts).
 */
export type MagicLinkState = { error: string | null };

const emailSchema = z.object({ email: z.string().email() });

export async function magicLinkSignInAction(
  _prevState: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: "Enter a valid email address." };

  try {
    await signIn("resend", {
      email: parsed.data.email,
      redirectTo: "/",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return {
        error:
          "Couldn't send the sign-in link. Please try again or use a password.",
      };
    }
    throw err;
  }
  return { error: null };
}

export async function googleSignInAction() {
  await signIn("google", { redirectTo: "/" });
}

export async function microsoftSignInAction() {
  await signIn("microsoft-entra-id", { redirectTo: "/" });
}

export async function githubSignInAction() {
  await signIn("github", { redirectTo: "/" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
  redirect("/login");
}
