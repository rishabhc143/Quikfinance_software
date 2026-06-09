"use client";

import * as React from "react";
import { MoreHorizontal, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ImportCoaDialog } from "./import-dialog";
import { ExportCoaDialog } from "./export-dialog";

/**
 * ACCT-E.4 — Chart of Accounts "More actions" menu.
 *
 * Spec's 3-dot menu items:
 *   - Import Chart of Accounts  (opens 2-step CSV wizard)
 *   - Export                    (opens scope picker)
 *
 * Sort UI used to live here as a "Sort by ▸" submenu but was
 * dropped — column-header clicks already sort the table and the
 * menu sub-list duplicated the affordance. URL-level sorting
 * (`?sort=<col>:<dir>`) is still honored by the page; the column
 * headers in the CoA table set those params on click.
 */
export function CoaActionsMenu({
  exportScope,
}: {
  /** `?status=…&q=…` from the list page, passed to the export
   *  dialog so the download honors the current view. */
  exportScope: string;
}) {
  const [importOpen, setImportOpen] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);

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
          <DropdownMenuItem onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5 mr-2" />
            Import Chart of Accounts
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => setExportOpen(true)}>
            <Download className="h-3.5 w-3.5 mr-2" />
            Export
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ImportCoaDialog open={importOpen} onOpenChange={setImportOpen} />
      <ExportCoaDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        scopeQuery={exportScope}
      />
    </>
  );
}
