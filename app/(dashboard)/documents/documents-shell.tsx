"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { DocumentsSidebar } from "./documents-sidebar";
import { DocumentsToolbar } from "./documents-toolbar";
import { FileTypeFilter } from "./file-type-filter";
import {
  DocumentsTable,
  type DocumentTableRow,
} from "./documents-table";

/**
 * DOC-D1: Client-side wrapper for the Documents 3-pane shell. Owns
 * the title resolution off `?inbox=` / `?view=` / `?folderId=` (server
 * pre-filters rows, client just renders the right title + sidebar
 * active state).
 *
 * Receives already-filtered rows from the server (`page.tsx`) — no
 * client-side fetching. Keeps the table snappy and the request shape
 * predictable.
 */
export function DocumentsShell({
  rows,
  trashCount,
  folderCount,
}: {
  rows: DocumentTableRow[];
  trashCount: number;
  folderCount: number;
}) {
  const searchParams = useSearchParams();
  const inbox = searchParams.get("inbox");
  const view = searchParams.get("view");

  let title = "All Documents";
  if (view === "trash") title = "Trash";
  else if (inbox === "files") title = "Files";
  else if (inbox === "bank-statements") title = "Bank Statements";

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      <DocumentsSidebar
        trashCount={trashCount}
        folderCount={folderCount}
      />

      <main className="flex-1 flex flex-col min-w-0 bg-background">
        <DocumentsToolbar title={title} />

        <div className="px-6 py-2.5 border-b bg-muted/10">
          <FileTypeFilter />
        </div>

        {/* Bank Statements inbox is a Phase D2 surface — show a
            friendly placeholder until Smart Capture ships. */}
        {inbox === "bank-statements" ? (
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
