"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Folder,
  Landmark,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FolderRow } from "@/lib/documents/folder-tree";
import { FolderTree } from "./folder-tree";
import { CreateFolderDialog } from "./create-folder-dialog";

/**
 * DOC-D1 / D1.2: Inner sidebar for the Documents page (left pane of
 * the 3-pane layout). Mirrors Zoho's sidebar:
 *   - "< Back" link + "Documents" heading
 *   - "All Documents" (highlighted when no filter param is set)
 *   - INBOXES section: Files / Bank Statements
 *   - FOLDERS section with "+" trigger + recursive tree
 *   - Trash row at bottom
 *
 * URL params drive the active view: `?inbox=files`, `?inbox=bank-statements`,
 * `?folderId=<id>`, `?view=trash`. No param == All Documents.
 */
export function DocumentsSidebar({
  trashCount,
  folders,
}: {
  trashCount: number;
  folders: FolderRow[];
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const inbox = searchParams.get("inbox");
  const view = searchParams.get("view");
  const folderId = searchParams.get("folderId");

  const isAll = !inbox && !view && !folderId;
  const isFilesInbox = inbox === "files";
  const isBankInbox = inbox === "bank-statements";
  const isTrash = view === "trash";

  const [createOpen, setCreateOpen] = React.useState(false);

  return (
    <aside className="w-full md:w-[260px] shrink-0 border-r bg-muted/20 flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>
        <h1 className="mt-1 text-lg font-semibold">Documents</h1>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {/* All Documents row */}
        <Link
          href={pathname}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm transition-colors",
            isAll
              ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
              : "text-foreground hover:bg-muted/60 border-l-2 border-transparent"
          )}
        >
          <FileText className="h-4 w-4" />
          All Documents
        </Link>

        {/* INBOXES section */}
        <div className="mt-4 px-4 text-xs font-semibold tracking-wider text-muted-foreground">
          INBOXES
        </div>
        <div className="mt-1">
          <Link
            href={`${pathname}?inbox=files`}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm transition-colors",
              isFilesInbox
                ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
                : "text-foreground hover:bg-muted/60 border-l-2 border-transparent"
            )}
          >
            <Folder className="h-4 w-4" />
            Files
          </Link>
          <Link
            href={`${pathname}?inbox=bank-statements`}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm transition-colors",
              isBankInbox
                ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
                : "text-foreground hover:bg-muted/60 border-l-2 border-transparent"
            )}
          >
            <Landmark className="h-4 w-4" />
            Bank Statements
          </Link>
        </div>

        {/* FOLDERS section */}
        <div className="mt-5 px-4 flex items-center justify-between">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground">
            FOLDERS
          </span>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            aria-label="Create folder"
            title="Create folder"
            className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        {folders.length === 0 ? (
          <div className="mt-2 px-4 text-center">
            <p className="text-xs text-muted-foreground">
              There are no folders.
            </p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-1 text-xs text-primary hover:underline"
            >
              Create New Folder
            </button>
          </div>
        ) : (
          <FolderTree folders={folders} />
        )}
      </div>

      {/* Trash row pinned to bottom */}
      <div className="border-t">
        <Link
          href={`${pathname}?view=trash`}
          className={cn(
            "flex items-center gap-2 px-4 py-3 text-sm transition-colors",
            isTrash
              ? "bg-primary/10 text-primary font-medium border-l-2 border-primary"
              : "text-foreground hover:bg-muted/60 border-l-2 border-transparent"
          )}
        >
          <Trash2 className="h-4 w-4" />
          <span className="flex-1">Trash</span>
          {trashCount > 0 ? (
            <span className="text-xs text-muted-foreground tabular-nums">
              {trashCount}
            </span>
          ) : null}
        </Link>
      </div>

      <CreateFolderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        parentFolderId={null}
      />
    </aside>
  );
}
