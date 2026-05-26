import NextAuth, { type NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import GitHub from "next-auth/providers/github";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

/**
 * Auth providers, gated by env vars. Each provider is only registered
 * if its credentials are present — so the /login UI can render the
 * full set today and individual buttons "light up" as you add the env
 * vars on Vercel. No env vars → no broken buttons.
 *
 * The `EnabledProviders` shape is exported so the login UI can render
 * only the buttons that actually work.
 */
export const enabledProviders = {
  credentials: true as const, // always — local password fallback
  google: Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  resend: Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM),
  microsoft: Boolean(
    process.env.AUTH_MICROSOFT_ID && process.env.AUTH_MICROSOFT_SECRET,
  ),
  github: Boolean(
    process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET,
  ),
};
export type EnabledProviders = typeof enabledProviders;

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    async authorize(raw) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      const user = await db.user.findUnique({
        where: { email: parsed.data.email },
      });
      if (!user || !user.passwordHash) return null;
      const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
      if (!ok) return null;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
      };
    },
  }),
];

if (enabledProviders.google) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      // Auto-link the OAuth identity to an existing email/password user
      // with the same address — so the user doesn't end up with two
      // separate accounts after using both flows.
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (enabledProviders.resend) {
  // Magic-link login: paste any email, click the link in your inbox,
  // you're in. Resend provider uses the existing RESEND_API_KEY +
  // EMAIL_FROM env already wired in lib/email.ts.
  providers.push(
    Resend({
      apiKey: process.env.RESEND_API_KEY!,
      from: process.env.EMAIL_FROM!,
    }),
  );
}

if (enabledProviders.microsoft) {
  providers.push(
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_SECRET!,
      // Default "common" tenant accepts both work/school and personal
      // Microsoft accounts. Override with AUTH_MICROSOFT_TENANT_ID for
      // single-tenant deployments.
      issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_TENANT_ID ?? "common"}/v2.0`,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

if (enabledProviders.github) {
  providers.push(
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
      allowDangerousEmailAccountLinking: true,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login", verifyRequest: "/verify-email" },
  // Required for self-hosted production builds (Vercel auto-detects). Without
  // this, NextAuth throws UntrustedHost on every /api/auth/* request because
  // it can't confirm the Host header matches an expected origin. Setting it
  // here is safe — we don't allow arbitrary hostname overrides downstream.
  trustHost: true,
  providers,
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as { id?: string }).id = token.userId as string;
      }
      return session;
    },
  },
});
