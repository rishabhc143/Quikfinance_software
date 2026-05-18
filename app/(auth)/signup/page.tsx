import Link from "next/link";
import { db } from "@/lib/db";
import { SignupForm } from "./form";

export const metadata = { title: "Create your account" };
export const dynamic = "force-dynamic";

/**
 * Server-side preload of the invitation context. If the URL has a
 * valid &invite=<token>&email=<email> pair, we look up the
 * EmailVerificationToken + placeholder User + org name so the
 * form can show a personalised "accept invitation" header and
 * pre-fill the email field.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: { email?: string; invite?: string };
}) {
  let invite: {
    token: string;
    email: string;
    organizationName: string;
  } | null = null;

  if (searchParams.invite && searchParams.email) {
    try {
      const row = await db.emailVerificationToken.findUnique({
        where: { token: searchParams.invite },
        include: {
          user: {
            include: {
              memberships: { include: { organization: true } },
            },
          },
        },
      });
      if (
        row &&
        row.expires > new Date() &&
        row.user.email === searchParams.email &&
        row.user.passwordHash === null && // only placeholder users
        row.user.memberships.length > 0
      ) {
        invite = {
          token: searchParams.invite,
          email: row.user.email,
          organizationName: row.user.memberships[0].organization.name,
        };
      }
    } catch {
      // fall through — render generic signup form
    }
  }

  return (
    <div className="space-y-6">
      <div>
        {invite ? (
          <>
            <h1 className="text-2xl font-semibold">
              Join {invite.organizationName}
            </h1>
            <p className="text-sm text-muted-foreground">
              You&apos;ve been invited to {invite.organizationName} on
              Quikfinance. Set up your account below to accept the
              invitation.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold">
              Create your Quikfinance account
            </h1>
            <p className="text-sm text-muted-foreground">
              Free 14-day trial · No credit card required
            </p>
          </>
        )}
      </div>
      <SignupForm invite={invite} />
      <div className="text-sm text-center text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-primary hover:underline font-medium"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
