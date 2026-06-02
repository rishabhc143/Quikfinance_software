"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadDocumentsAction, type UploadDocumentItemResult } from "./actions-upload";

/**
 * DOC-D1.3: Files inbox surface — matches the user-shared Zoho
 * screenshot exactly:
 *
 *   ┌────────────────────────────────────────────┐
 *   │           ☁️  Drag & Drop Files Here          │
 *   │   Upload your documents (Images, PDF, …)    │
 *   │            [ Choose files to upload ]       │
 *   └────────────────────────────────────────────┘
 *
 *   ┌────────────────────────────────────────────┐
 *   │  ✉️  Upload Files via Email                  │
 *   │  Configure email address … [Coming soon]    │
 *   └────────────────────────────────────────────┘
 *
 * Uses primitive widely-used method only: native HTML `<input
 * type="file" multiple>` + `onDrop` events. No paid OCR backend, no
 * Autoscan badge — explicitly going free-tier-only per user direction.
 * Smart Capture (free, pdf-parse-powered) lands in Phase D2.
 */
export function FilesInbox({ rows }: { rows: Array<{ id: string; name: string; mimeType: string | null }> }) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [results, setResults] = React.useState<UploadDocumentItemResult[]>([]);

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setUploading(true);
    setResults([]);

    const fd = new FormData();
    files.forEach((f, i) => fd.set(`file_${i}`, f));

    const result = await uploadDocumentsAction(fd);
    setUploading(false);
    setResults(result.results);

    const uploaded = result.results.filter((r) => r.status === "uploaded").length;
    const duplicates = result.results.filter((r) => r.status === "duplicate").length;
    const errors = result.results.filter((r) => r.status === "error").length;

    if (uploaded > 0) {
      toast.success(
        `${uploaded} file${uploaded === 1 ? "" : "s"} uploaded${
          duplicates > 0 ? `, ${duplicates} skipped (duplicate)` : ""
        }${errors > 0 ? `, ${errors} failed` : ""}.`
      );
      router.refresh();
    } else if (duplicates > 0 && errors === 0) {
      toast.info(`All ${duplicates} file${duplicates === 1 ? " was a" : "s were"} duplicate${duplicates === 1 ? "" : "s"} — nothing uploaded.`);
    } else if (errors > 0) {
      toast.error(`Upload failed — see details below.`);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) {
      void handleFiles(e.dataTransfer.files);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8 max-w-5xl mx-auto w-full">
      {/* Drag-drop card */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-lg border-2 border-dashed transition-colors px-6 py-16",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-input bg-background"
        )}
      >
        <div className="flex flex-col items-center text-center">
          {uploading ? (
            <Loader2 className="h-16 w-16 text-primary animate-spin" />
          ) : (
            <UploadCloud className="h-16 w-16 text-orange-400" />
          )}
          <h2 className="mt-5 text-lg font-semibold">
            {uploading ? "Uploading…" : "Drag & Drop Files Here"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload your documents (Images, PDF, Docs or Sheets) here
          </p>
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="mt-6"
          >
            {uploading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                Uploading…
              </>
            ) : (
              "Choose files to upload"
            )}
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) void handleFiles(e.target.files);
              // Clear so re-picking the same file fires onChange again.
              e.target.value = "";
            }}
          />
        </div>
      </div>

      {/* Upload result breakdown */}
      {results.length > 0 ? (
        <div className="mt-6 rounded-lg border bg-background overflow-hidden">
          <div className="px-4 py-2 border-b bg-muted/20 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Upload results
          </div>
          <ul className="divide-y">
            {results.map((r, idx) => (
              <li
                key={`${r.fileName}-${idx}`}
                className="flex items-start gap-3 px-4 py-2.5 text-sm"
              >
                {r.status === "uploaded" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : r.status === "duplicate" ? (
                  <FileText className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.fileName}</div>
                  <div
                    className={cn(
                      "text-xs",
                      r.status === "uploaded"
                        ? "text-emerald-600"
                        : r.status === "duplicate"
                        ? "text-amber-700"
                        : "text-destructive"
                    )}
                  >
                    {r.status === "uploaded"
                      ? "Uploaded successfully"
                      : r.status === "duplicate"
                      ? r.message
                      : r.message}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Existing files in the Files inbox — shown as a simple list
          below the upload area. */}
      {rows.length > 0 ? (
        <div className="mt-6 rounded-lg border bg-background overflow-hidden">
          <div className="px-4 py-2 border-b bg-muted/20 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Files in this inbox · {rows.length}
          </div>
          <ul className="divide-y">
            {rows.map((d) => (
              <li
                key={d.id}
                className="flex items-center gap-3 px-4 py-2.5 text-sm"
              >
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 truncate font-medium">{d.name}</span>
                <span className="text-xs text-muted-foreground">
                  {d.mimeType ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
