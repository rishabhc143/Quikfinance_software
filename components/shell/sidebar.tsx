"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Package, FileText, ShoppingCart, Wallet,
  Clock, BookOpen, BarChart3, FolderOpen, CreditCard,
  Settings, ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Top-level dashboard nav.
 *
 * Items with `children` render as a click-to-toggle group (the reference design
 * pattern). The group header itself is a button — it does not navigate
 * — so the sub-items are the only navigation targets. Groups whose
 * children contain the current pathname auto-expand on mount.
 */
type NavLeaf = { label: string; href: string };
type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavLeaf[];
};

const NAV: NavItem[] = [
  { label: "Home", href: "/", icon: LayoutDashboard },
  {
    label: "Items",
    href: "/items",
    icon: Package,
    children: [
      { label: "All Items", href: "/items" },
    ],
  },
  {
    label: "Sales",
    href: "/sales",
    icon: FileText,
    children: [
      { label: "Customers", href: "/sales/customers" },
      { label: "Quotes", href: "/sales/quotes" },
      { label: "Sales Orders", href: "/sales/orders" },
      { label: "Invoices", href: "/sales/invoices" },
      { label: "Recurring Invoices", href: "/sales/recurring-invoices" },
      { label: "Delivery Challans", href: "/sales/delivery-challans" },
      { label: "Payments Received", href: "/sales/payments-received" },
      { label: "Credit Notes", href: "/sales/credit-notes" },
    ],
  },
  {
    label: "Purchases",
    // Land directly on the Vendors list (the most common entry point)
    // instead of the bare /purchases redirect — avoids the meta-refresh
    // flash that a Server Component `redirect()` produces when invoked
    // after the dashboard layout has already started streaming.
    href: "/purchases/vendors",
    icon: ShoppingCart,
    children: [
      { label: "Vendors", href: "/purchases/vendors" },
      { label: "Bills", href: "/purchases/bills" },
      { label: "Expenses", href: "/purchases/expenses" },
      { label: "Purchase Orders", href: "/purchases/orders" },
      { label: "Payments Made", href: "/purchases/payments-made" },
      { label: "Recurring Bills", href: "/purchases/recurring-bills" },
      { label: "Recurring Expenses", href: "/purchases/recurring-expenses" },
      { label: "Vendor Credits", href: "/purchases/vendor-credits" },
    ],
  },
  {
    label: "Time Tracking",
    href: "/time",
    icon: Clock,
    children: [
      { label: "Projects", href: "/time/projects" },
      { label: "Timesheet", href: "/time/entries" },
    ],
  },
  { label: "Banking", href: "/banking", icon: Wallet },
  {
    label: "Accountant",
    href: "/accountant",
    icon: BookOpen,
    children: [
      { label: "Chart of Accounts", href: "/accountant/chart-of-accounts" },
      { label: "Manual Journals", href: "/accountant/manual-journals" },
      { label: "Currency Adjustments", href: "/accountant/currency-adjustments" },
      { label: "Budgets", href: "/accountant/budgets" },
      { label: "Bulk Update", href: "/accountant/bulk-update" },
      // Note: /accountant/journal-entries is still a live route (the
      // canonical ledger view); it's unlinked from the sidebar so the
      // accountant-module nav surfaces the workflow entry points
      // instead of the read-only ledger drilldown.
    ],
  },
  {
    // Single entry point — clicking "Reports" lands on the
    // Reports Center (`/reports`) which lists all 80 reports
    // grouped by category with search + favorites. We used to
    // expose 10 hardcoded children here but they were noisy and
    // duplicated the Center's table; the Center is the canonical
    // surface now.
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
  },
  { label: "Documents", href: "/documents", icon: FolderOpen },
  { label: "Payments", href: "/payments", icon: CreditCard },
  // Contacts intentionally removed from the sidebar — customers live under
  // /sales/customers and vendors live under /purchases/vendors. The legacy
  // /contacts route still exists for deep links + quick-create flows, but
  // it's no longer a default nav entry.
];

/** True when `pathname` is the same as `href` or a descendant of it. */
function isUnder(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/**
 * Pick the child whose href is the longest prefix of `pathname`. Avoids
 * the "All Items" + "Inventory Adjustments" overlap problem where
 * /items/inventory-adjustments would otherwise light up both.
 */
function findActiveChild(pathname: string, children: NavLeaf[]): string | null {
  let bestHref: string | null = null;
  let bestLen = -1;
  for (const c of children) {
    if (isUnder(pathname, c.href) && c.href.length > bestLen) {
      bestHref = c.href;
      bestLen = c.href.length;
    }
  }
  return bestHref;
}

export function Sidebar({ orgName }: { orgName: string }) {
  const pathname = usePathname();

  // Auto-expand groups containing the current pathname. We seed once
  // from initial pathname; user toggles override this for the rest of
  // the session. (No persistence — the next page load re-derives.)
  const [openGroups, setOpenGroups] = React.useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const item of NAV) {
      if (item.children?.length && isUnder(pathname, item.href)) {
        initial.add(item.href);
      }
    }
    return initial;
  });

  // When the user navigates inside a different module (e.g. Sales →
  // Purchases via the command palette), expand that module without
  // collapsing the previously-open one. This keeps the manual toggles
  // stable while still revealing the active section.
  React.useEffect(() => {
    setOpenGroups((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const item of NAV) {
        if (
          item.children?.length &&
          isUnder(pathname, item.href) &&
          !next.has(item.href)
        ) {
          next.add(item.href);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [pathname]);

  function toggle(href: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  return (
    <aside className="hidden md:flex md:w-60 md:flex-col border-r bg-muted/30">
      <div className="px-4 py-4 border-b">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-gradient-to-br from-primary to-primary/60 grid place-items-center text-primary-foreground font-bold shadow-sm">Q</div>
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
          const Icon = item.icon;
          const hasChildren = !!item.children?.length;
          const groupActive = isUnder(pathname, item.href);

          if (!hasChildren) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-2 text-sm transition-colors",
                  groupActive
                    ? "bg-primary/10 text-primary font-semibold border-r-2 border-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          }

          const isOpen = openGroups.has(item.href);
          return (
            <div key={item.href}>
              <button
                type="button"
                onClick={() => toggle(item.href)}
                aria-expanded={isOpen}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2 text-sm",
                  groupActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{item.label}</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    isOpen ? "rotate-0" : "-rotate-90"
                  )}
                />
              </button>
              {isOpen ? (
                <div>
                  {(() => {
                    const activeChildHref = findActiveChild(pathname, item.children!);
                    return item.children!.map((child) => {
                      const childActive = activeChildHref === child.href;
                      return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "flex items-center pl-11 pr-4 py-1.5 text-sm",
                          childActive
                            ? "bg-primary/10 text-primary border-r-2 border-primary font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent"
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  });
                  })()}
                </div>
              ) : null}
            </div>
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
