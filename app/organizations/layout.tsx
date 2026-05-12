import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { signOutAction } from "@/app/(auth)/login/actions";

/**
 * Layout for the "create your first organization" onboarding screen.
 *
 * IMPORTANT: this route deliberately lives OUTSIDE the (dashboard)
 * group so it does NOT inherit the dashboard layout's
 * `requireOrganization()` gate. A logged-in user with no
 * Organization membership would otherwise loop forever:
 *
 *   GET / → dashboard layout → requireOrganization() →
 *   redirect /organizations/new → if also inside (dashboard),
 *   redirect /organizations/new → … → ERR_TOO_MANY_REDIRECTS.
 *
 * The previous layout location (`app/(dashboard)/organizations/`)
 * caused exactly that loop in production for users who signed up
 * via /signup (which creates a User row but no Organization).
 *
 * This layout uses `requireUser()` only — auth-gated, but
 * org-agnostic. Renders a minimal centered shell so the user can
 * either create their org or sign out and try a different account.
 */
export default async function OrganizationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      <header className="border-b bg-background">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary text-primary-foreground grid place-items-center font-bold">
              Q
            </div>
            <span className="font-semibold tracking-tight">Quikfinance</span>
          </Link>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="hidden sm:inline">
              Signed in as <strong className="text-foreground">{user.email}</strong>
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="underline-offset-2 hover:underline"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center py-8">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
