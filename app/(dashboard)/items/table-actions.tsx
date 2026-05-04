"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSub, DropdownMenuSubTrigger,
  DropdownMenuSubContent, DropdownMenuPortal, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ExportModal } from "./export-modals";

export function ItemsTableActions({ sort, dir }: { sort: string; dir: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [exportScope, setExportScope] = React.useState<"all" | "view" | null>(null);

  function setSort(field: string, d: "asc" | "desc") {
    const next = new URLSearchParams(sp.toString());
    next.set("sort", field);
    next.set("dir", d);
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }
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
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Sort by</DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {([
                  ["name", "Name"], ["costPrice", "Purchase Rate"], ["sellingPrice", "Rate"],
                  ["updatedAt", "Last Modified Time"], ["createdAt", "Created Time"],
                ] as const).map(([field, label]) => (
                  <React.Fragment key={field}>
                    <DropdownMenuItem onSelect={() => setSort(field, "asc")} className={sort === field && dir === "asc" ? "font-semibold" : ""}>
                      {label} ↑
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setSort(field, "desc")} className={sort === field && dir === "desc" ? "font-semibold" : ""}>
                      {label} ↓
                    </DropdownMenuItem>
                  </React.Fragment>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
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
