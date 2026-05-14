"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const LABELS: Record<string, string> = {
  active: "Active Accounts",
  all: "All Accounts",
  archived: "Archived Accounts",
};

/**
 * ACCT-E.2 — "Active Accounts ▾" dropdown header. Replaces the
 * pre-existing filter pills with a single dropdown that matches
 * Zoho's UX. Pushes `?status=` to the URL so the page query knows
 * which filter is in effect.
 */
export function StatusSwitcher({
  current,
  counts,
}: {
  current: "active" | "all" | "archived";
  counts: { active: number; all: number; archived: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function go(status: "active" | "all" | "archived") {
    const next = new URLSearchParams(search?.toString() ?? "");
    if (status === "active") next.delete("status");
    else next.set("status", status);
    // Reset to page 1 when the filter changes.
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex items-center gap-1.5 text-xl font-semibold hover:opacity-80">
        {LABELS[current]}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => go("active")}>
          Active Accounts
          <span className="ml-auto text-xs text-muted-foreground">
            {counts.active}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("all")}>
          All Accounts
          <span className="ml-auto text-xs text-muted-foreground">
            {counts.all}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go("archived")}>
          Archived Accounts
          <span className="ml-auto text-xs text-muted-foreground">
            {counts.archived}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
