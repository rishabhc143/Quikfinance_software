"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, Users, FileText, ShoppingCart, Wallet,
  Clock, BookOpen, BarChart3, FolderOpen, CreditCard, BadgeIndianRupee,
  Settings, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV: { label: string; href: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  { label: "Items", href: "/items", icon: Package },
  { label: "Sales", href: "/sales", icon: FileText },
  { label: "Purchases", href: "/purchases", icon: ShoppingCart },
  { label: "Time Tracking", href: "/time", icon: Clock },
  { label: "Banking", href: "/banking", icon: Wallet },
  { label: "Accountant", href: "/accountant", icon: BookOpen },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Documents", href: "/documents", icon: FolderOpen },
  { label: "Payroll", href: "/payroll", icon: BadgeIndianRupee },
  { label: "Payments", href: "/payments", icon: CreditCard },
  { label: "Contacts", href: "/contacts", icon: Users },
];

export function Sidebar({ orgName }: { orgName: string }) {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r bg-muted/30">
      <div className="px-4 py-4 border-b">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-primary to-blue-700 grid place-items-center text-primary-foreground font-bold">Q</div>
          <div>
            <div className="text-sm font-semibold leading-tight">Quikfinance</div>
            <div className="text-xs text-muted-foreground leading-tight flex items-center gap-1">
              {orgName} <ChevronDown className="h-3 w-3" />
            </div>
          </div>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-2 text-sm",
                active ? "bg-primary/10 text-primary border-r-2 border-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-2">
        <Link href="/settings" className="flex items-center gap-3 px-2 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md">
          <Settings className="h-4 w-4" /> Settings
        </Link>
      </div>
    </aside>
  );
}
