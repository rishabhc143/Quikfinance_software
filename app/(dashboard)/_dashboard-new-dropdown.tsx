"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The "+ New" split-button used on the home page's Total
 * Receivables and Total Payables cards. Click → dropdown with
 * 3 quick-action links.
 *
 * Receives plain string props (label + href) only — never icons
 * or functions across the server→client boundary.
 */
export type NewDropdownItem = {
  label: string;
  href: string;
};

export function NewRecordDropdown({
  triggerLabel = "New",
  items,
}: {
  triggerLabel?: string;
  items: NewDropdownItem[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3 w-3 mr-1" />
          {triggerLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {items.map((it) => (
          <DropdownMenuItem key={it.href} asChild>
            <Link href={it.href} className="cursor-pointer">
              <Plus className="h-3.5 w-3.5 mr-2 text-primary" />
              {it.label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
