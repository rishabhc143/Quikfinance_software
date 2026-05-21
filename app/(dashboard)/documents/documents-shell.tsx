"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type { FolderRow } from "@/lib/documents/folder-tree";
import { DocumentsSidebar } from "./documents-sidebar";
import { DocumentsToolbar } from "./documents-toolbar";
import { FileTypeFilter } from "./file-type-filter";
import {
  DocumentsTable,
  type DocumentTableRow,
} from "./documents-table";
import { FilesInbox } from "./files-inbox";

/**
 * DOC-D1 / D1.2 / D1.3: Client-side wrapper for the Documents 3-pane
 * shell. Owns the title resolution off `?inbox=` / `?view=` /
 * `?folderId=` (server pre-filters rows, client renders the title +
 * sidebar active state).
 *
 * - `?inbox=files` → renders <FilesInbox> (drag-drop + email stub),
 *   matches the user-shared screenshot exactly.
 * - `?inbox=bank-statements` → Phase D2 placeholder.
 * - default / folder / trash → the regular 5-column documents table.
 */
export function DocumentsShell({
  rows,
  trashCount,
  folders,
  folderBreadcrumb,
}: {
  rows: DocumentTableRow[];
  trashCount: number;
  folders: FolderRow[];
  folderBreadcrumb: Array<{ id: string; name: string }>;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const inbox = searchParams.get("inbox");
  const view = searchParams.get("view");

  let title = "All Documents";
  if (view === "trash") title = "Trash";
  else if (inbox === "files") title = "Files";
  else if (inbox === "bank-statements") title = "Bank Statements";
  else if (folderBreadcrumb.length > 0) {
    title = folderBreadcrumb[folderBreadcrumb.length - 1].name;
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <DocumentsSidebar trashCount={trashCount} folders={folders} />

      <main className="flex-1 flex flex-col min-w-0 bg-background">
        <DocumentsToolbar title={title} />

        {/* Breadcrumb shows the folder path when drilled in. */}
        {folderBreadcrumb.length > 0 ? (
          <nav
            aria-label="Folder breadcrumb"
            className="px-6 py-2 border-b bg-muted/10 text-xs"
          >
            <ol className="flex items-center gap-1 flex-wrap text-muted-foreground">
              <li>
                <Link href={pathname} className="hover:underline">
                  All Documents
                </Link>
              </li>
              {folderBreadcrumb.map((crumb, idx) => {
                const isLast = idx === folderBreadcrumb.length - 1;
                return (
                  <React.Fragment key={crumb.id}>
                    <li>
                      <ChevronRight className="h-3 w-3" />
                    </li>
                    <li>
                      {isLast ? (
                        <span className="font-medium text-foreground">
                          {crumb.name}
                        </span>
                      ) : (
                        <Link
                          href={`${pathname}?folderId=${crumb.id}`}
                          className="hover:underline"
                        >
                          {crumb.name}
                        </Link>
                      )}
                    </li>
                  </React.Fragment>
                );
              })}
            </ol>
          </nav>
        ) : null}

        {/* Files inbox has its own drag-drop layout — no file-type
            filter on top because the surface IS an upload area. */}
        {inbox !== "files" ? (
          <div className="px-6 py-2.5 border-b bg-muted/10">
            <FileTypeFilter />
          </div>
        ) : null}

        {inbox === "files" ? (
          <FilesInbox
            rows={rows.map((r) => ({
              id: r.id,
              name: r.name,
              mimeType: r.mimeType,
            }))}
          />
        ) : inbox === "bank-statements" ? (
          /* Phase D2 placeholder until Smart Capture ships. */
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-base font-medium">
              Bank statements inbox is coming soon
            </p>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Quikfinance Smart Capture will land here in Phase D2.
              Drop any HDFC/ICICI/Axis/SBI/Kotak PDF and we&apos;ll
              auto-extract transactions for one-click import — free,
              no credits.
            </p>
          </div>
        ) : (
          <DocumentsTable rows={rows} />
        )}
      </main>
    </div>
  );
}
