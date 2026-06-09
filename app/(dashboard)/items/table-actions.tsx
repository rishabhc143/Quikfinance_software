"use client";

import * as React from "react";
import Link from "next/link";
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
 * Items removed over time as the table acquired native equivalents:
 *   - "Sort by" submenu — column-header clicks already sort, the
 *     submenu duplicated the affordance.
 *   - "Refresh List" — browser refresh / Next.js router refresh on
 *     navigation already covers this; the menu item was unused noise.
 *   - "Reset Column Width" — column widths weren't user-resizable
 *     anywhere this menu fronted, so the localStorage clear was a
 *     dead-end action.
 *
 * URL-level sorting (parsed by `parseListSearchParams`) and the
 * column-header `SortHeader` component (items-table.tsx) are untouched.
 */
export function ItemsTableActions() {
  const [exportScope, setExportScope] = React.useState<"all" | "view" | null>(null);

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
        </DropdownMenuContent>
      </DropdownMenu>

      {exportScope && (
        <ExportModal open={true} onOpenChange={(v) => !v && setExportScope(null)} scope={exportScope} />
      )}
    </>
  );
}
