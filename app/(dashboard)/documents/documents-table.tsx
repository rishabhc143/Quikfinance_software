"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  Search,
  FileText,
  Image as ImageIcon,
  FileSpreadsheet,
  FileType,
  File,
  X,
  RotateCcw,
  Trash2,
  MoreVertical,
  Loader2,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  fileTypeFromMime,
  type FileTypeBucket,
} from "@/lib/documents/file-type";
import type { AssociatedToCell } from "@/lib/documents/associated-to";
import { cn } from "@/lib/utils";
import {
  DocumentPreviewDrawer,
  type DocumentPreviewItem,
} from "./document-preview-drawer";
import {
  deleteDocumentAction,
  restoreDocumentAction,
  purgeDocumentAction,
} from "./actions";

/**
 * DOC-D1 / D1.4: The 5-column documents table inside the main pane.
 * Matches the Zoho screenshot:
 *   ☐ | FILE NAME | UPLOADED BY | UPLOADED ON | ASSOCIATED TO | FOLDER
 *
 * D1.4 changes:
 *   - Row click opens the inline preview drawer (was: open in new tab)
 *   - ASSOCIATED TO column renders type + name + deep link
 *   - In Trash view (?view=trash), rows expose Restore + Permanently
 *     Delete actions; All-Documents view exposes Move to Trash.
 */

export type DocumentTableRow = {
  id: string;
  name: string;
  url: string;
  mimeType: string | null;
  uploadedBy: string;
  uploadedAt: string; // ISO
  associatedTo: AssociatedToCell | null;
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

export function DocumentsTable({
  rows,
  trashView = false,
}: {
  rows: DocumentTableRow[];
  trashView?: boolean;
}) {
  const router = useRouter();
  const [searching, setSearching] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activePreview, setActivePreview] =
    React.useState<DocumentPreviewItem | null>(null);
  const [pendingActionId, setPendingActionId] = React.useState<string | null>(
    null
  );

  const filtered = React.useMemo(() => {
    if (!query.trim()) return rows;
    const needle = query.toLowerCase();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        (r.folder?.toLowerCase().includes(needle) ?? false) ||
        (r.associatedTo?.name.toLowerCase().includes(needle) ?? false) ||
        r.uploadedBy.toLowerCase().includes(needle)
    );
  }, [rows, query]);

  function openPreview(r: DocumentTableRow) {
    setActivePreview({
      id: r.id,
      name: r.name,
      url: r.url,
      mimeType: r.mimeType,
      uploadedBy: r.uploadedBy,
      uploadedAt: r.uploadedAt,
      folder: r.folder,
    });
  }

  async function onMoveToTrash(id: string, name: string) {
    if (!confirm(`Move "${name}" to Trash?`)) return;
    setPendingActionId(id);
    const result = await deleteDocumentAction(id);
    setPendingActionId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Moved to Trash");
    router.refresh();
  }

  async function onRestore(id: string) {
    setPendingActionId(id);
    const result = await restoreDocumentAction(id);
    setPendingActionId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Restored from Trash");
    router.refresh();
  }

  async function onPurge(id: string, name: string) {
    if (
      !confirm(
        `Permanently delete "${name}"? This cannot be undone — the file will be removed from storage too.`
      )
    )
      return;
    setPendingActionId(id);
    const result = await purgeDocumentAction(id);
    setPendingActionId(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Permanently deleted");
    router.refresh();
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Table header */}
      <div className="border-b bg-muted/20 relative">
        <div className="grid grid-cols-[44px_1.4fr_1fr_0.9fr_1fr_0.9fr_40px] items-center text-xs font-semibold tracking-wider uppercase text-muted-foreground">
          <div className="px-3 py-2.5">
            <input
              type="checkbox"
              disabled
              title="Bulk select arrives in a follow-up"
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
            {trashView
              ? "Trash is empty"
              : "No documents have been added"}
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
            const isPending = pendingActionId === r.id;
            return (
              <div
                key={r.id}
                className={cn(
                  "grid grid-cols-[44px_1.4fr_1fr_0.9fr_1fr_0.9fr_40px] items-center text-sm border-b hover:bg-muted/40 transition-colors group",
                  isPending && "opacity-50"
                )}
              >
                <div className="px-3 py-3">
                  <input
                    type="checkbox"
                    disabled
                    title="Bulk select arrives in a follow-up"
                    className="h-3.5 w-3.5 rounded border-input opacity-50 cursor-not-allowed"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => openPreview(r)}
                  className="px-3 py-3 flex items-center gap-2 min-w-0 text-left hover:underline"
                >
                  <Icon className={cn("h-4 w-4 shrink-0", colorClass)} />
                  <span className="truncate font-medium text-foreground">
                    {r.name}
                  </span>
                </button>
                <div className="px-3 py-3 text-muted-foreground truncate">
                  {r.uploadedBy || "—"}
                </div>
                <div className="px-3 py-3 text-muted-foreground tabular-nums">
                  {format(new Date(r.uploadedAt), "dd MMM yyyy")}
                </div>
                <div className="px-3 py-3 truncate" onClick={(e) => e.stopPropagation()}>
                  {r.associatedTo ? (
                    <Link
                      href={r.associatedTo.href}
                      className="inline-flex items-baseline gap-1.5 hover:underline"
                      title={`${r.associatedTo.typeLabel}: ${r.associatedTo.name}`}
                    >
                      <span className="text-[10px] uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                        {r.associatedTo.typeLabel}
                      </span>
                      <span className="truncate text-foreground">
                        {r.associatedTo.name}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
                <div className="px-3 py-3 text-muted-foreground truncate">
                  {r.folder ?? "—"}
                </div>
                <div className="px-3 py-3 flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Actions for ${r.name}`}
                      className="opacity-60 group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-muted"
                      disabled={isPending}
                    >
                      {isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <MoreVertical className="h-3.5 w-3.5" />
                      )}
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="min-w-[180px]"
                    >
                      <DropdownMenuItem onSelect={() => openPreview(r)}>
                        <Eye className="h-3.5 w-3.5 mr-2" />
                        Preview
                      </DropdownMenuItem>
                      {trashView ? (
                        <>
                          <DropdownMenuItem
                            onSelect={() => void onRestore(r.id)}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-2" />
                            Restore
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => void onPurge(r.id, r.name)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Permanently delete
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => void onMoveToTrash(r.id, r.name)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-2" />
                            Move to Trash
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <DocumentPreviewDrawer
        doc={activePreview}
        onClose={() => setActivePreview(null)}
      />
    </div>
  );
}
