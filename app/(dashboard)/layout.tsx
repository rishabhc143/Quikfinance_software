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
      {/* M18 a11y: skip-to-main link, visible only on focus. */}
      <a
        href="#dashboard-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow"
      >
        Skip to main content
      </a>
      <Sidebar orgName={organization.name} />
      <div className="flex flex-1 flex-col min-w-0">
        <TopHeader user={user} organization={organization} memberships={memberships} />
        <MobileSearch />
        <main
          id="dashboard-main"
          tabIndex={-1}
          className="flex-1 overflow-y-auto bg-muted/20 outline-none"
        >
          {children}
        </main>
      </div>
      <RightRail />
      <AiAssistant />
    </div>
  );
}
