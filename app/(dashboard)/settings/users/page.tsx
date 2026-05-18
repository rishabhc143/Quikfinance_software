import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { UsersManager } from "./manager";

export const metadata = { title: "Users" };
export const dynamic = "force-dynamic";

/**
 * Server Component — fetches OrganizationMemberships for the
 * current org. Belt-and-suspenders try/catch so we never bubble
 * an opaque "Server Components render" error.
 */
export default async function UsersPage() {
  try {
    const { user: me, organization } = await requireOrganization();
    const memberships = await db.organizationMembership.findMany({
      where: { organizationId: organization.id },
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
                isMe: m.userId === me.id,
                name: m.user.name,
                email: m.user.email,
                image: m.user.image,
              }))}
              pending={pending.map((m) => ({
                id: m.id,
                email: m.user.email,
                role: m.role,
                invitedAt:
                  m.createdAt instanceof Date
                    ? m.createdAt.toISOString()
                    : String(m.createdAt),
              }))}
            />
          </CardContent>
        </Card>
      </SettingsShell>
    );
  } catch (err) {
    const stack =
      err instanceof Error
        ? `${err.name}: ${err.message}\n${err.stack ?? ""}`
        : String(err);
    console.error("[settings/users] page render failed", stack);
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
                Try refreshing in a minute. Your data is safe — this
                is a display-only issue.
              </p>
              <p className="text-xs text-muted-foreground mt-2 font-mono">
                {err instanceof Error
                  ? `${err.name}: ${err.message}`
                  : "unknown error"}
              </p>
            </div>
          </CardContent>
        </Card>
      </SettingsShell>
    );
  }
}
