"use client";

import * as React from "react";
import { format } from "date-fns";
import {
  X,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { fileTypeFromMime } from "@/lib/documents/file-type";

/**
 * DOC-D1.4: Side-drawer preview for a single document.
 *
 * Uses native browser primitives only (per "primitive widely-used
 * method" guidance):
 *   - `<iframe>` for PDFs (browsers render PDFs natively)
 *   - `<img>` for images (PNG / JPG / WEBP / HEIC where supported)
 *   - friendly "Open in new tab" fallback for other types
 *
 * Built on shadcn Dialog with a custom right-side slide-in layout to
 * match the rest of the app's drawer pattern (e.g. customize-report
 * drawer in reports). No pdf.js or react-pdf — keeps the bundle
 * lean and we ship today.
 */

export type DocumentPreviewItem = {
  id: string;
  name: string;
  url: string;
  mimeType: string | null;
  uploadedBy: string;
  uploadedAt: string;
  folder: string | null;
};

export function DocumentPreviewDrawer({
  doc,
  onClose,
}: {
  doc: DocumentPreviewItem | null;
  onClose: () => void;
}) {
  const open = !!doc;
  const [iframeLoaded, setIframeLoaded] = React.useState(false);

  // Reset spinner whenever the doc changes.
  React.useEffect(() => {
    if (doc) setIframeLoaded(false);
  }, [doc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className={cn(
          // Override shadcn defaults to make this a right-side drawer.
          "max-w-none sm:max-w-none p-0 gap-0",
          "fixed right-0 top-0 left-auto translate-x-0 translate-y-0",
          "h-screen w-full sm:w-[640px] rounded-none border-l",
          "data-[state=open]:slide-in-from-right-1/2",
          "data-[state=closed]:slide-out-to-right-1/2"
        )}
        // Hide the default shadcn close X so we render our own with
        // controls inline in the header bar.
      >
        <DialogTitle className="sr-only">{doc?.name ?? "Document preview"}</DialogTitle>
        {doc ? <PreviewBody doc={doc} iframeLoaded={iframeLoaded} setIframeLoaded={setIframeLoaded} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PreviewBody({
  doc,
  iframeLoaded,
  setIframeLoaded,
  onClose,
}: {
  doc: DocumentPreviewItem;
  iframeLoaded: boolean;
  setIframeLoaded: (v: boolean) => void;
  onClose: () => void;
}) {
  const bucket = fileTypeFromMime(doc.mimeType);
  const isImage = bucket === "image";
  const isPdf = bucket === "pdf";

  return (
    <div className="flex flex-col h-full">
      {/* Header bar with name + actions + close */}
      <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0 bg-muted/20">
        {isImage ? (
          <ImageIcon className="h-4 w-4 text-green-600 shrink-0" />
        ) : (
          <FileText className="h-4 w-4 text-red-500 shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate" title={doc.name}>
            {doc.name}
          </div>
          <div className="text-xs text-muted-foreground">
            {doc.uploadedBy} · {format(new Date(doc.uploadedAt), "dd MMM yyyy")}
            {doc.folder ? ` · ${doc.folder}` : ""}
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8">
          <a href={doc.url} download>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download
          </a>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-8">
          <a href={doc.url} target="_blank" rel="noreferrer">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Open
          </a>
        </Button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="p-1.5 rounded hover:bg-muted ml-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden bg-muted/10 relative">
        {isPdf ? (
          <>
            {!iframeLoaded ? (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Loader2 className="h-6 w-6 text-muted-foreground animate-spin" />
              </div>
            ) : null}
            <iframe
              key={doc.id}
              src={doc.url}
              title={doc.name}
              className="w-full h-full bg-background"
              onLoad={() => setIframeLoaded(true)}
            />
          </>
        ) : isImage ? (
          <div className="h-full overflow-auto flex items-start justify-center p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={doc.url}
              alt={doc.name}
              className="max-w-full h-auto rounded border"
            />
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-sm font-medium">In-browser preview not available</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              This file type ({doc.mimeType ?? "unknown"}) doesn&apos;t
              render inline. Use Download or Open in a new tab.
            </p>
            <div className="flex gap-2 mt-4">
              <Button asChild variant="outline" size="sm">
                <a href={doc.url} download>
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download
                </a>
              </Button>
              <Button asChild size="sm">
                <a href={doc.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open in new tab
                </a>
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
