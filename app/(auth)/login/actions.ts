"use server";

import { signIn, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";

const schema = z.object({ email: z.string().email(), password: z.string().min(6) });

export type LoginState = { error: string | null };

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
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

export async function googleSignInAction() {
  await signIn("google", { redirectTo: "/" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
  redirect("/login");
}
