import { requireOrganization } from "@/lib/auth-helpers";
import { Sidebar } from "@/components/shell/sidebar";
import { TopHeader, MobileSearch } from "@/components/shell/top-header";
import { RightRail } from "@/components/shell/right-rail";
import { AiAssistant } from "@/components/dashboard/ai-assistant";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // `requireOrganization()` is `react.cache`-wrapped (see lib/auth-helpers.ts),
  // so the page below this layout calling the same helper resolves to the
  // already-fetched user+memberships — no second auth() + DB roundtrip.
  // We also read memberships off `user` here instead of issuing a separate
  // `db.organizationMembership.findMany` query (the deep include already
  // loaded them sorted by Prisma's default ordering, then we sort here for
  // the TopHeader's org switcher).
  const { user, organization } = await requireOrganization();
  const memberships = [...user.memberships].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

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
