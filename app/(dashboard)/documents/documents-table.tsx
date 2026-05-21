"use client";

import * as React from "react";
import Link from "next/link";
import { format } from "date-fns";
import {
  Search,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  FileType,
  File,
  ExternalLink,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  fileTypeFromMime,
  type FileTypeBucket,
} from "@/lib/documents/file-type";
import { cn } from "@/lib/utils";

/**
 * DOC-D1: The 5-column documents table inside the main pane. Matches
 * the Zoho screenshot exactly:
 *   ☐ | FILE NAME | UPLOADED BY | UPLOADED ON | ASSOCIATED TO | FOLDER
 * with a search icon at the far right of the header row that expands
 * into an inline filter input.
 *
 * Renders the empty state ("No documents have been added") when rows
 * is empty.
 */

export type DocumentTableRow = {
  id: string;
  name: string;
  url: string;
  mimeType: string | null;
  uploadedBy: string;
  uploadedAt: string; // ISO
  associatedTo: string | null;
  folder: string | null;
};

function iconFor(bucket: FileTypeBucket) {
  switch (bucket) {
    case "pdf":
      return FileText;
    case "image":
      return ImageIcon;
    case "spreadsheet":
      return FileSpreadsheet;
    case "word":
      return FileType;
    default:
      return File;
  }
}

function iconColorFor(bucket: FileTypeBucket) {
  switch (bucket) {
    case "pdf":
      return "text-red-500";
    case "image":
      return "text-green-600";
    case "spreadsheet":
      return "text-emerald-600";
    case "word":
      return "text-blue-600";
    default:
      return "text-muted-foreground";
  }
}

export function DocumentsTable({ rows }: { rows: DocumentTableRow[] }) {
  const [searching, setSearching] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    if (!query.trim()) return rows;
    const needle = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.folder?.toLowerCase().includes(needle) ?? false) ||
        (r.associatedTo?.toLowerCase().includes(needle) ?? false) ||
        r.uploadedBy.toLowerCase().includes(needle)
    );
  }, [rows, query]);

  return (
    <div className="flex-1 flex flex-col">
      {/* Table header */}
      <div className="border-b bg-muted/20 relative">
        <div className="grid grid-cols-[44px_1.4fr_1fr_0.9fr_1fr_0.9fr_40px] items-center text-xs font-semibold tracking-wider uppercase text-muted-foreground">
          <div className="px-3 py-2.5">
            <input
              type="checkbox"
              disabled
              title="Bulk select arrives in PR D1.3"
              className="h-3.5 w-3.5 rounded border-input opacity-50 cursor-not-allowed"
            />
          </div>
          <div className="px-3 py-2.5">File Name</div>
          <div className="px-3 py-2.5">Uploaded By</div>
          <div className="px-3 py-2.5">Uploaded On</div>
          <div className="px-3 py-2.5">Associated To</div>
          <div className="px-3 py-2.5">Folder</div>
          <div className="px-3 py-2.5 flex items-center justify-end">
            {searching ? (
              <div className="absolute right-6 top-1.5 z-10 flex items-center gap-1 bg-background border rounded-md shadow-sm pl-2 pr-1 py-0.5">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onBlur={() => {
                    if (!query) setSearching(false);
                  }}
                  placeholder="Search documents"
                  className="h-7 w-48 border-0 shadow-none focus-visible:ring-0 px-1 text-xs normal-case tracking-normal font-normal text-foreground"
                />
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setSearching(false);
                  }}
                  className="p-0.5 rounded hover:bg-muted"
                  aria-label="Close search"
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSearching(true)}
                className="p-1 rounded hover:bg-muted/60"
                aria-label="Search documents"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Empty state OR rows */}
      {rows.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-24">
          <p className="text-sm text-muted-foreground">
            No documents have been added
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-24">
          <p className="text-sm text-muted-foreground">
            No documents match &ldquo;{query}&rdquo;.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filtered.map((r) => {
            const bucket = fileTypeFromMime(r.mimeType);
            const Icon = iconFor(bucket);
            const colorClass = iconColorFor(bucket);
            return (
              <Link
                key={r.id}
                href={r.url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "grid grid-cols-[44px_1.4fr_1fr_0.9fr_1fr_0.9fr_40px] items-center text-sm border-b hover:bg-muted/40 transition-colors"
                )}
              >
                <div className="px-3 py-3">
                  <input
                    type="checkbox"
                    disabled
                    onClick={(e) => e.stopPropagation()}
                    title="Bulk select arrives in PR D1.3"
                    className="h-3.5 w-3.5 rounded border-input opacity-50 cursor-not-allowed"
                  />
                </div>
                <div className="px-3 py-3 flex items-center gap-2 min-w-0">
                  <Icon className={cn("h-4 w-4 shrink-0", colorClass)} />
                  <span className="truncate font-medium text-foreground">
                    {r.name}
                  </span>
                </div>
                <div className="px-3 py-3 text-muted-foreground truncate">
                  {r.uploadedBy || "—"}
                </div>
                <div className="px-3 py-3 text-muted-foreground tabular-nums">
                  {format(new Date(r.uploadedAt), "dd MMM yyyy")}
                </div>
                <div className="px-3 py-3 text-muted-foreground truncate">
                  {r.associatedTo ?? "—"}
                </div>
                <div className="px-3 py-3 text-muted-foreground truncate">
                  {r.folder ?? "—"}
                </div>
                <div className="px-3 py-3 flex justify-end">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/60" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
