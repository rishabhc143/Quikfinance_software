"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, CheckCircle2, AlertCircle } from "lucide-react";

/**
 * Tally Companion — upload widget (client island).
 *
 * Drag-drop or click-to-pick a Tally XML file, posts it to
 * /api/companion/upload, then surfaces the result inline before
 * refreshing the page so the history list picks up the new
 * MigrationBatch row.
 *
 * v1 keeps it simple — single file, synchronous upload, no
 * resumability. Background-processing for >10MB files is Phase 2.
 */

type UploadResult = {
  ok: true;
  batchId: string;
  sourceFormat: string;
  counts: { ledgers: number; vouchers: number; warnings: number };
  warnings: { code: string; message: string; sourceGuid?: string }[];
};

export function TallyUploader() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const resp = await fetch("/api/companion/upload", {
        method: "POST",
        body: form,
      });
      const json = (await resp.json()) as
        | UploadResult
        | { error: string; batchId?: string };
      if (!resp.ok || "error" in json) {
        const msg = "error" in json ? json.error : "Upload failed";
        setError(msg);
      } else {
        setResult(json);
        // Refresh the server component so the history list shows
        // the new batch row.
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !busy && inputRef.current?.click()}
        className={`rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition ${
          dragOver
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 hover:bg-muted/30"
        } ${busy ? "opacity-50 pointer-events-none" : ""}`}
      >
        {busy ? (
          <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            Importing your Tally data...
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 text-sm">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <div className="font-medium">
              Drag your Tally XML file here, or click to browse
            </div>
            <div className="text-xs text-muted-foreground">
              Max 10 MB &middot; Tally Prime supported
            </div>
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".xml,application/xml,text/xml"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          disabled={busy}
        />
      </div>

      {result && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-emerald-900">
            <CheckCircle2 className="h-4 w-4" />
            Import complete
          </div>
          <div className="text-emerald-800 mt-1">
            {result.counts.ledgers} ledgers &middot;{" "}
            {result.counts.vouchers} sales vouchers
            {result.counts.warnings > 0 && (
              <> &middot; {result.counts.warnings} warning(s)</>
            )}
          </div>
          {result.warnings.length > 0 && (
            <details className="mt-2 text-xs text-emerald-900">
              <summary className="cursor-pointer">Show warnings</summary>
              <ul className="mt-2 space-y-1 list-disc pl-5">
                {result.warnings.slice(0, 10).map((w, i) => (
                  <li key={i}>{w.message}</li>
                ))}
                {result.warnings.length > 10 && (
                  <li className="italic">
                    ...and {result.warnings.length - 10} more
                  </li>
                )}
              </ul>
            </details>
          )}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium text-red-900">
            <AlertCircle className="h-4 w-4" />
            Import failed
          </div>
          <div className="text-red-800 mt-1">{error}</div>
        </div>
      )}
    </div>
  );
}
