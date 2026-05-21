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
import { InboxEmailCard } from "./inbox-email-card";

/**
 * DOC-D1 / D1.2 / D1.3 / D1.4: Client-side wrapper for the Documents
 * 3-pane shell. Owns the title resolution off `?inbox=` / `?view=` /
 * `?folderId=` (server pre-filters rows, client renders the title +
 * sidebar active state).
 *
 * - `?inbox=files` → renders <FilesInbox> (drag-drop + email stub),
 *   matches the user-shared screenshot exactly.
 * - `?inbox=bank-statements` → Phase D2 placeholder.
 * - `?view=trash` → table with Restore + Permanently Delete actions
 *   (`trashView` prop forwarded to the table).
 * - default / folder → the regular 5-column documents table with
 *   Move-to-Trash action.
 */
export function DocumentsShell({
  rows,
  trashCount,
  folders,
  folderBreadcrumb,
  trashView = false,
}: {
  rows: DocumentTableRow[];
  trashCount: number;
  folders: FolderRow[];
  folderBreadcrumb: Array<{ id: string; name: string }>;
  trashView?: boolean;
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
          /* DOC-D3.1: Bank Statements inbox now shows the live email
              address (when configured) + the existing table of
              auto-routed statements. Removes the old "Coming soon"
              placeholder — Phase D2 already ships the parsing, D3.1
              ships the email-forwarding workflow. */
          <div className="flex-1 overflow-y-auto">
            <div className="px-8 py-6 max-w-5xl mx-auto w-full space-y-4">
              <div>
                <h2 className="text-base font-semibold">
                  Bank Statements
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Auto-routed here when Smart Capture detects a
                  bank-statement PDF. Forward statements straight to
                  your inbox address below — we&apos;ll parse the
                  transactions and let you import them to Banking with
                  one click.
                </p>
              </div>
              <InboxEmailCard />
              {rows.length > 0 ? (
                <div className="-mx-8">
                  <DocumentsTable rows={rows} trashView={trashView} />
                </div>
              ) : (
                <div className="rounded-lg border-2 border-dashed bg-background px-6 py-10 text-center text-sm text-muted-foreground">
                  No bank statements yet. Upload one via the Files
                  inbox or forward it to the address above.
                </div>
              )}
            </div>
          </div>
        ) : (
          <DocumentsTable rows={rows} trashView={trashView} />
        )}
      </main>
    </div>
  );
}
