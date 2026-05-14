"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  MoreHorizontal,
  ArrowUpDown,
  Upload,
  Download,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { ImportCoaDialog } from "./import-dialog";

/**
 * ACCT-E.4 — Chart of Accounts "More actions" menu.
 *
 * Mirrors Zoho's 3-dot menu:
 *   - Sort by ▸  (Account Name / Account Code / Account Type)
 *   - Import Chart of Accounts  (opens 2-step CSV wizard)
 *   - Export ▸  (Export to CSV)
 *
 * Sort writes `?sort=<col>:<dir>` to the URL so the server
 * component re-fetches in the new order. The current sort is
 * highlighted with a check mark for orientation.
 */

type SortKey = "name" | "code" | "type";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Account Name" },
  { key: "code", label: "Account Code" },
  { key: "type", label: "Account Type" },
];

export function CoaActionsMenu({
  currentSort,
  exportHref,
}: {
  /** Current sort encoded as `<key>:<dir>` or null when default. */
  currentSort: string | null;
  /** Pre-built `/export?…` href the Export option links to. */
  exportHref: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [importOpen, setImportOpen] = React.useState(false);

  const [curKey, curDir] = (currentSort ?? "type:asc").split(":") as [
    SortKey,
    SortDir,
  ];

  function setSort(key: SortKey, dir: SortDir) {
    const next = new URLSearchParams(search?.toString() ?? "");
    if (key === "type" && dir === "asc") next.delete("sort");
    else next.set("sort", `${key}:${dir}`);
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowUpDown className="h-3.5 w-3.5 mr-2" />
              Sort by
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                {SORT_OPTIONS.map((opt) => {
                  const ascActive = curKey === opt.key && curDir === "asc";
                  const descActive = curKey === opt.key && curDir === "desc";
                  return (
                    <React.Fragment key={opt.key}>
                      <DropdownMenuItem
                        onClick={() => setSort(opt.key, "asc")}
                      >
                        {ascActive ? (
                          <Check className="h-3.5 w-3.5 mr-2" />
                        ) : (
                          <span className="w-3.5 mr-2" />
                        )}
                        {opt.label} (A→Z)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setSort(opt.key, "desc")}
                      >
                        {descActive ? (
                          <Check className="h-3.5 w-3.5 mr-2" />
                        ) : (
                          <span className="w-3.5 mr-2" />
                        )}
                        {opt.label} (Z→A)
                      </DropdownMenuItem>
                    </React.Fragment>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>

          <DropdownMenuItem onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5 mr-2" />
            Import Chart of Accounts
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Download className="h-3.5 w-3.5 mr-2" />
              Export
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent>
                <DropdownMenuItem asChild>
                  <a href={exportHref}>
                    <Download className="h-3.5 w-3.5 mr-2" />
                    Export to CSV
                  </a>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      <ImportCoaDialog open={importOpen} onOpenChange={setImportOpen} />
    </>
  );
}
