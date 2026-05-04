import Link from "next/link";
import { Bell, Settings, Plus, Users as UsersIcon, Search } from "lucide-react";
import type { Organization, OrganizationMembership, User } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { CommandPaletteTrigger } from "./command-palette";
import { OrgSwitcher } from "./org-switcher";
import { QuickCreate } from "./quick-create";
import { ReferEarn } from "./refer-earn";
import { Notifications } from "./notifications";
import { ProfilePopover } from "./profile-popover";
import { ThemeToggle } from "./theme-toggle";

type Props = {
  user: User;
  organization: Organization;
  memberships: (OrganizationMembership & { organization: Organization })[];
};

export function TopHeader({ user, organization, memberships }: Props) {
  const trialEnds = organization.trialEndsAt;
  const trialDays = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - Date.now()) / 86_400_000)) : null;

  return (
    <header className="border-b bg-background">
      <div className="flex h-14 items-center gap-2 px-4">
        {/* 1. Search / command palette */}
        <CommandPaletteTrigger />

        <div className="flex-1" />

        {/* 2. Trial banner */}
        {trialDays !== null && organization.planTier === "trial" && (
          <div className="hidden lg:flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-md px-3 py-1.5">
            <span>Your premium trial ends in {trialDays} day{trialDays === 1 ? "" : "s"}</span>
            <Link href="/settings/subscription" className="underline">Subscribe</Link>
          </div>
        )}

        {/* 3. Subscribe link */}
        <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
          <Link href="/settings/subscription">Subscribe</Link>
        </Button>

        {/* 4. Organization switcher */}
        <OrgSwitcher activeOrgId={organization.id} memberships={memberships} />

        {/* 5. Quick Create */}
        <QuickCreate>
          <Button variant="ghost" size="icon" aria-label="Quick create">
            <Plus className="h-5 w-5" />
          </Button>
        </QuickCreate>

        {/* 6. Refer & Earn */}
        <ReferEarn referralCode={user.referralCode ?? ""}>
          <Button variant="ghost" size="icon" aria-label="Refer and earn">
            <UsersIcon className="h-5 w-5" />
          </Button>
        </ReferEarn>

        {/* 7. Notifications */}
        <Notifications organizationId={organization.id}>
          <Button variant="ghost" size="icon" aria-label="Notifications">
            <Bell className="h-5 w-5" />
          </Button>
        </Notifications>

        {/* 8. Settings + Profile */}
        <Button asChild variant="ghost" size="icon" aria-label="Settings">
          <Link href="/settings"><Settings className="h-5 w-5" /></Link>
        </Button>

        <div className="xl:hidden">
          <ThemeToggle />
        </div>

        <ProfilePopover user={user} organization={organization} />
      </div>
    </header>
  );
}

export function MobileSearch() {
  return (
    <div className="md:hidden p-2 border-b">
      <div className="flex items-center gap-2 px-3 py-1.5 border rounded-md text-sm text-muted-foreground">
        <Search className="h-4 w-4" /> Search…
      </div>
    </div>
  );
}
