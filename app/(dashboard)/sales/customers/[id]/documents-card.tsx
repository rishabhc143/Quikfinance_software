"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, Trash2, FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export type ExistingDocument = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  createdAt: Date;
};

export function DocumentsCard({
  contactId,
  initialDocuments,
  uploadAction,
  deleteAction,
}: {
  contactId: string;
  initialDocuments: ExistingDocument[];
  uploadAction: (input: {
    contactId: string;
    files: {
      fileName: string;
      fileUrl: string;
      fileSize: number;
      mimeType: string;
    }[];
  }) => Promise<unknown>;
  deleteAction: (documentId: string) => Promise<unknown>;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [docs, setDocs] = React.useState(initialDocuments);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const remaining = 10 - docs.length;

  async function onFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    if (fileList.length > remaining) {
      toast.error(`You can upload at most ${remaining} more file(s)`);
      return;
    }
    const files: {
      fileName: string;
      fileUrl: string;
      fileSize: number;
      mimeType: string;
    }[] = [];
    for (const f of Array.from(fileList)) {
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name} exceeds 10MB`);
        return;
      }
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(f);
      });
      files.push({
        fileName: f.name,
        fileUrl: dataUrl,
        fileSize: f.size,
        mimeType: f.type || "application/octet-stream",
      });
    }
    setBusy(true);
    try {
      await uploadAction({ contactId, files });
      toast.success(`Uploaded ${files.length} file(s)`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeDoc(id: string) {
    if (!confirm("Delete this document?")) return;
    setBusy(true);
    try {
      await deleteAction(id);
      setDocs(docs.filter((d) => d.id !== id));
      toast.success("Document removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Documents ({docs.length} / 10)
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || remaining <= 0}
            onClick={() => inputRef.current?.click()}
            className="gap-1"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No documents uploaded yet. Max 10 files, 10 MB each.
          </p>
        ) : (
          <ul className="text-sm divide-y">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 py-2"
              >
                <a
                  href={d.fileUrl}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-2 hover:underline truncate"
                >
                  <FileIcon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{d.fileName}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {(d.fileSize / 1024).toFixed(0)} KB
                  </span>
                </a>
                <button
                  type="button"
                  aria-label={`Remove ${d.fileName}`}
                  onClick={() => removeDoc(d.id)}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  disabled={busy}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
