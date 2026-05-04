"use client";

import * as React from "react";
import Link from "next/link";
import type { Organization, User } from "@prisma/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { LogOut, BookOpen, MessageCircle, Video, Compass, ArrowRightLeft, Accessibility } from "lucide-react";
import { signOutAction } from "@/app/(auth)/login/actions";

type Props = { user: User; organization: Organization };

export function ProfilePopover({ user, organization }: Props) {
  const initials = (user.name ?? user.email).split(" ").map((s) => s[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Avatar className="h-8 w-8">
            {user.image && <AvatarImage src={user.image} alt={user.name ?? user.email} />}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-4 border-b">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              {user.image && <AvatarImage src={user.image} alt={user.name ?? user.email} />}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{user.name ?? user.email}</div>
              <div className="text-xs text-muted-foreground truncate">{user.email}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div><span className="font-medium text-foreground block">User ID</span>{user.id.slice(0, 12)}…</div>
            <div><span className="font-medium text-foreground block">Org ID</span>{organization.id.slice(0, 12)}…</div>
          </div>
        </div>

        <div className="p-2 space-y-1">
          <Link href="/account" className="block px-3 py-2 rounded text-sm hover:bg-accent">My Account</Link>
          <form action={signOutAction}>
            <button type="submit" className="w-full text-left px-3 py-2 rounded text-sm hover:bg-accent flex items-center gap-2 text-destructive">
              <LogOut className="h-4 w-4" /> Sign Out
            </button>
          </form>
        </div>

        {organization.planTier === "trial" && (
          <div className="px-4 py-3 border-t border-b bg-amber-50/50 dark:bg-amber-950/30">
            <div className="text-xs text-amber-800 dark:text-amber-200">
              Trial plan ·{" "}
              <Link href="/settings/subscription" className="underline">Change Trial Plan</Link>
              {" | "}
              <Link href="/settings/subscription" className="underline">Subscribe</Link>
            </div>
          </div>
        )}

        <div className="p-2 grid grid-cols-3 gap-1 text-xs text-center">
          <Tile href="/help" icon={BookOpen} label="Help" />
          <Tile href="/help/faqs" icon={MessageCircle} label="FAQs" />
          <Tile href="/help/forum" icon={MessageCircle} label="Forum" />
          <Tile href="/help/videos" icon={Video} label="Videos" />
          <Tile href="/help/explore" icon={Compass} label="Explore" />
          <Tile href="/help/migration" icon={ArrowRightLeft} label="Migration" />
        </div>

        <div className="p-2 border-t">
          <Button variant="ghost" size="sm" className="w-full justify-start" asChild>
            <Link href="/settings/accessibility"><Accessibility className="h-4 w-4 mr-2" /> Accessibility Preferences</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Tile({ href, icon: Icon, label }: { href: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1 py-2 rounded hover:bg-accent">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span>{label}</span>
    </Link>
  );
}
