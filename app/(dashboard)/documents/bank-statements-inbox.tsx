"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Landmark,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  uploadBankStatementsAction,
  type UploadDocumentItemResult,
} from "./actions";
import {
  DocumentsTable,
  type DocumentTableRow,
} from "./documents-table";

/**
 * Bank Statements inbox surface — makes the inbox directly functional
 * with its own drag-drop area (was read-only before this fix).
 *
 * Differences vs Files inbox:
 *   - Drag-drop hands off to `uploadBankStatementsAction` which forces
 *     `inbox = BANK_STATEMENTS` + `documentType = BANK_STATEMENT` +
 *     runs the bank-statement parser unconditionally
 *   - Help copy explains password-protected PDFs aren't supported yet
 *     (D4.1 will add that)
 *   - List below the drop area shows previously-uploaded statements
 *     with a row count badge per parsed file
 */
export function BankStatementsInbox({
  rows,
}: {
  rows: DocumentTableRow[];
}) {
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
    const result = await uploadBankStatementsAction(fd);
    setUploading(false);
    setResults(result.results);

    const uploaded = result.results.filter((r) => r.status === "uploaded").length;
    const duplicates = result.results.filter((r) => r.status === "duplicate").length;
    const errors = result.results.filter((r) => r.status === "error").length;

    if (uploaded > 0) {
      toast.success(
        `${uploaded} statement${uploaded === 1 ? "" : "s"} uploaded${
          duplicates > 0 ? `, ${duplicates} skipped (duplicate)` : ""
        }${errors > 0 ? `, ${errors} failed` : ""}.`
      );
      router.refresh();
    } else if (duplicates > 0 && errors === 0) {
      toast.info(
        `All ${duplicates} file${duplicates === 1 ? " was a" : "s were"} duplicate${duplicates === 1 ? "" : "s"} — nothing uploaded.`
      );
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
    <div className="flex-1 overflow-y-auto">
      <div className="px-8 py-6 max-w-5xl mx-auto w-full space-y-4">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Landmark className="h-4 w-4 text-blue-600" />
            Bank Statements
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Drop bank statement PDFs here — Smart Capture parses
            transactions for HDFC, ICICI, Axis, SBI, Kotak, and IDFC.
            One click imports them to Banking.
          </p>
        </div>

        {/* Drag-drop card */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={cn(
            "rounded-lg border-2 border-dashed transition-colors px-6 py-10",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-input bg-background"
          )}
        >
          <div className="flex flex-col items-center text-center">
            {uploading ? (
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
            ) : (
              <UploadCloud className="h-12 w-12 text-blue-500" />
            )}
            <h3 className="mt-4 text-base font-semibold">
              {uploading ? "Uploading + parsing…" : "Drop bank statement PDFs here"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-md">
              We&apos;ll extract transactions automatically.
              Multi-statement drop supported.
            </p>
            <Button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="mt-4"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Working…
                </>
              ) : (
                "Choose bank statement PDFs"
              )}
            </Button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="application/pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files?.length) void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* Tip: password-protected PDFs need manual decrypt for now */}
        <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs">
          <Info className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-amber-900">
            <span className="font-medium">Password-protected PDFs</span> aren&apos;t
            supported yet — Indian banks usually ship statements encrypted
            with your DOB or customer ID. Open in Adobe Reader / Preview, save
            as a new PDF without the password, then drop here. (Password
            support is on the roadmap.)
          </div>
        </div>

        {/* Upload results breakdown */}
        {results.length > 0 ? (
          <div className="rounded-lg border bg-background overflow-hidden">
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
                        ? "Uploaded — click the row below to view parsed transactions"
                        : r.message}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* Statements list */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Statements in this inbox · {rows.length}
          </div>
          {rows.length > 0 ? (
            <div className="-mx-8 border-t">
              <DocumentsTable rows={rows} />
            </div>
          ) : (
            <div className="rounded-lg border-2 border-dashed bg-background px-6 py-10 text-center text-sm text-muted-foreground">
              No bank statements yet. Drop a PDF above or forward one
              to the email address on this page.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
