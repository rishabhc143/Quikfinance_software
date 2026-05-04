import { requireOrganization } from "@/lib/auth-helpers";
import { Sidebar } from "@/components/shell/sidebar";
import { TopHeader, MobileSearch } from "@/components/shell/top-header";
import { RightRail } from "@/components/shell/right-rail";
import { AiAssistant } from "@/components/dashboard/ai-assistant";
import { db } from "@/lib/db";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, organization } = await requireOrganization();
  const memberships = await db.organizationMembership.findMany({
    where: { userId: user.id },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="flex min-h-screen">
      <Sidebar orgName={organization.name} />
      <div className="flex flex-1 flex-col min-w-0">
        <TopHeader user={user} organization={organization} memberships={memberships} />
        <MobileSearch />
        <main className="flex-1 overflow-y-auto bg-muted/20">{children}</main>
      </div>
      <RightRail />
      <AiAssistant />
    </div>
  );
}
