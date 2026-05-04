import { Card, CardContent } from "@/components/ui/card";
import { SettingsShell } from "@/components/shared/settings-shell";
import { db } from "@/lib/db";
import { requireOrganization } from "@/lib/auth-helpers";
import { UsersManager } from "./manager";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const { user: me, organization } = await requireOrganization();
  const memberships = await db.organizationMembership.findMany({
    where: { organizationId: organization.id },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: [{ createdAt: "asc" }],
  });
  return (
    <SettingsShell title="Users" description="People who have access to this organization. Invite teammates and manage their roles.">
      <Card>
        <CardContent className="pt-6">
          <UsersManager
            currentUserId={me.id}
            members={memberships.map((m) => ({
              id: m.id,
              userId: m.userId,
              role: m.role,
              isMe: m.userId === me.id,
              name: m.user.name,
              email: m.user.email,
              image: m.user.image,
            }))}
          />
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
