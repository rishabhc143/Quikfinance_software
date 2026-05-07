"use client";

import * as React from "react";
import { Paperclip, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export type AttachedFile = {
  fileName: string;
  fileUrl: string; // data: URL for v1
  fileSize: number;
  mimeType: string;
};

/**
 * Shared "Attach File(s)" field for transaction forms (Quote / Sales
 * Order / Invoice / Credit Note / Delivery Challan). Per the Sales
 * master prompt every form has this field with per-doc-type max counts
 * and 5–10 MB per file. Uses data-URL fallback (D36) until S3 wires up.
 */
export function AttachFilesField({
  initial,
  onChange,
  maxFiles = 5,
  maxSizeMb = 10,
  label = "Attach files",
}: {
  initial?: AttachedFile[];
  onChange: (files: AttachedFile[]) => void;
  maxFiles?: number;
  maxSizeMb?: number;
  label?: string;
}) {
  const [files, setFiles] = React.useState<AttachedFile[]>(initial ?? []);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    onChange(files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  async function onFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    if (files.length + list.length > maxFiles) {
      toast.error(`Maximum ${maxFiles} files allowed`);
      return;
    }
    const next: AttachedFile[] = [...files];
    for (const f of Array.from(list)) {
      if (f.size > maxSizeMb * 1024 * 1024) {
        toast.error(`${f.name} exceeds ${maxSizeMb} MB`);
        return;
      }
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(f);
      });
      next.push({
        fileName: f.name,
        fileUrl: dataUrl,
        fileSize: f.size,
        mimeType: f.type || "application/octet-stream",
      });
    }
    setFiles(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeAt(i: number) {
    setFiles(files.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium inline-flex items-center gap-1">
          <Paperclip className="h-4 w-4" /> {label}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={files.length >= maxFiles}
          className="gap-1"
        >
          <Upload className="h-4 w-4" />
          Upload File
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>
      {files.length > 0 ? (
        <ul className="rounded-md border divide-y text-sm">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between p-2">
              <a
                href={f.fileUrl}
                target="_blank"
                rel="noopener"
                className="hover:underline truncate"
              >
                {f.fileName}{" "}
                <span className="text-xs text-muted-foreground">
                  · {(f.fileSize / 1024).toFixed(0)} KB
                </span>
              </a>
              <button
                type="button"
                aria-label={`Remove ${f.fileName}`}
                onClick={() => removeAt(i)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Maximum {maxFiles} files, {maxSizeMb} MB each.
        </p>
      )}
    </div>
  );
}
