"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { uploadDocumentAction } from "../actions-upload";

/**
 * Direct file upload form. Posts to `uploadDocumentAction` which
 * streams the file to Vercel Blob and persists a Document row.
 *
 * Renders alongside (not replacing) the URL-based form so users can
 * still link to externally-hosted files (Drive, Dropbox, etc.).
 */
export function UploadForm() {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [displayName, setDisplayName] = React.useState("");
  const [folder, setFolder] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setError(null);
    if (f && !displayName) {
      // Default the display name to the file's base name.
      setDisplayName(f.name.replace(/\.[^.]+$/, ""));
    }
  }

  function clearFile() {
    setFile(null);
    setDisplayName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const fd = new FormData();
    fd.set("file", file);
    fd.set("name", displayName || file.name);
    fd.set("folder", folder);

    const result = await uploadDocumentAction(fd);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    clearFile();
    setFolder("");
    router.push("/documents");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {file ? (
        <div className="flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2.5 text-sm">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{file.name}</div>
            <div className="text-xs text-muted-foreground">
              {(file.size / 1024).toFixed(1)} KB
              {file.type ? ` · ${file.type}` : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={clearFile}
            className="p-1 rounded hover:bg-background"
            aria-label="Remove file"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <label
          htmlFor="file-picker"
          className="flex flex-col items-center gap-2 rounded-md border-2 border-dashed border-input bg-muted/20 px-6 py-10 cursor-pointer hover:bg-muted/40 transition"
        >
          <Upload className="h-6 w-6 text-muted-foreground" />
          <span className="text-sm font-medium">Click to choose a file</span>
          <span className="text-xs text-muted-foreground">
            PDF, JPG, PNG, CSV, XLSX · up to 10 MB
          </span>
          <input
            id="file-picker"
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={onPickFile}
          />
        </label>
      )}

      <div>
        <Label>Name</Label>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value.slice(0, 200))}
          placeholder="Display name (defaults to file name)"
        />
      </div>
      <div>
        <Label>Folder</Label>
        <Input
          value={folder}
          onChange={(e) => setFolder(e.target.value.slice(0, 80))}
          placeholder="Receipts, Contracts, Bank Statements…"
        />
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button
          type="submit"
          disabled={submitting || !file}
          className="gap-1.5"
        >
          {submitting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload className="h-3.5 w-3.5" />
              Upload
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
