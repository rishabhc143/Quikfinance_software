"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger,
  DropdownMenuSubContent, DropdownMenuPortal, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ExportModal } from "./export-modals";

/**
 * Items list-page overflow menu.
 *
 * The "Sort by" submenu used to live here as a redundant way to set
 * `?sort=…&dir=…` via menu picks. It was dropped because column-header
 * clicks already sort the table — that's the discoverable native
 * pattern — and the menu sub-list duplicated the affordance with two
 * extra clicks. URL-level sorting (parsed by `parseListSearchParams`)
 * and column-header `SortHeader` (lib/items/items-table.tsx) are
 * untouched.
 */
export function ItemsTableActions() {
  const router = useRouter();

  const [exportScope, setExportScope] = React.useState<"all" | "view" | null>(null);

  function refresh() { router.refresh(); }
  function resetCols() {
    if (typeof window !== "undefined") localStorage.removeItem("qf:items-column-widths");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More actions">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem asChild><Link href="/items/import">Import Items</Link></DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem onSelect={() => setExportScope("all")}>Export Items</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setExportScope("view")}>Export Current View</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link href="/settings/preferences/items">Preferences</Link></DropdownMenuItem>
          <DropdownMenuItem onSelect={refresh}>Refresh List</DropdownMenuItem>
          <DropdownMenuItem onSelect={resetCols}>Reset Column Width</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {exportScope && (
        <ExportModal open={true} onOpenChange={(v) => !v && setExportScope(null)} scope={exportScope} />
      )}
    </>
  );
}
