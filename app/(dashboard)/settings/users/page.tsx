import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { UsersManager } from "./manager";

export const metadata = { title: "Users" };
export const dynamic = "force-dynamic";

/**
 * Server Component — fetches all OrganizationMemberships for the
 * current org + splits into "active" (real users with a password)
 * vs "pending" (placeholder users created by the invite flow,
 * passwordHash === null).
 *
 * Belt-and-suspenders defensive: every layer wrapped in try/catch
 * so we never bubble an opaque "Server Components render" error.
 * On failure, we render the simplest possible UsersManager with
 * an empty members list and surface the diagnosis in Vercel logs
 * via console.error.
 */
export default async function UsersPage() {
  let me: Awaited<ReturnType<typeof requireOrganization>>["user"] | null = null;
  try {
    const auth = await requireOrganization();
    me = auth.user;

    const memberships = await db.organizationMembership.findMany({
      where: { organizationId: auth.organization.id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            passwordHash: true,
            createdAt: true,
          },
        },
      },
      orderBy: [{ createdAt: "asc" }],
    });

    const active = memberships.filter((m) => m.user.passwordHash !== null);
    const pending = memberships.filter((m) => m.user.passwordHash === null);

    return (
      <SettingsShell
        title="Users"
        description="People who have access to this organization. Invite teammates and manage their roles."
      >
        <Card>
          <CardContent className="pt-6">
            <UsersManager
              currentUserId={me.id}
              members={active.map((m) => ({
                id: m.id,
                userId: m.userId,
                role: m.role,
                isMe: m.userId === me!.id,
                name: m.user.name,
                email: m.user.email,
                image: m.user.image,
              }))}
              pending={pending.map((m) => ({
                id: m.id,
                email: m.user.email,
                role: m.role,
                invitedAt: m.createdAt.toISOString(),
              }))}
            />
          </CardContent>
        </Card>
      </SettingsShell>
    );
  } catch (err) {
    // Log the FULL error to Vercel logs so we can see what's
    // happening when the user reports a server-component render
    // error. Then render a minimal-state page so the UI at
    // least doesn't blow up.
    const stack =
      err instanceof Error
        ? `${err.name}: ${err.message}\n${err.stack ?? ""}`
        : String(err);
    console.error(
      "[settings/users] page render failed — falling back to empty state",
      stack
    );
    return (
      <SettingsShell
        title="Users"
        description="People who have access to this organization."
      >
        <Card>
          <CardContent className="pt-6">
            <div className="rounded-md border bg-amber-50 dark:bg-amber-950/20 p-4 text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-200">
                Couldn&apos;t load the team list.
              </p>
              <p className="text-amber-800 dark:text-amber-300 mt-1">
                The team list is temporarily unavailable. Try
                refreshing in a minute. Your data is safe — this is
                a display-only issue.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                ref: {(err as { digest?: string })?.digest ?? "unknown"}
              </p>
            </div>
          </CardContent>
        </Card>
      </SettingsShell>
    );
  }
}
