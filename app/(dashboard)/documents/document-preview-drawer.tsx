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
import {
  asDocumentType,
  labelForDocumentType,
  badgeClassFor,
} from "@/lib/documents/document-types";
import {
  isParsedBankStatement,
  type ParsedBankStatement,
} from "@/lib/documents/parsers/bank-statement-types";
import { Landmark } from "lucide-react";
import { ImportToBankDialog } from "./import-to-bank-dialog";
import { listBankAccountsForImportAction } from "./actions";

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
  /** DOC-D2.1: Smart Capture classification result (may be null until
   *  D2.2+ adds parsers — D2.1 only fills this for PDFs). */
  documentType?: string | null;
  /** DOC-D2.1: Full extracted text (capped at 64KB). Shown in the
   *  Smart Capture panel of the preview drawer. Null = not extracted. */
  extractedText?: string | null;
  /** DOC-D2.2: Parsed bank statement (ParsedBankStatement JSON) when
   *  the document is a bank statement with a recognised layout.
   *  Drawer renders the Transactions table + "Import to Bank" button
   *  when non-null. */
  extractedFields?: unknown;
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
  const detectedType = asDocumentType(doc.documentType);

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
          <div className="text-sm font-semibold truncate flex items-center gap-2" title={doc.name}>
            <span className="truncate">{doc.name}</span>
            {/* DOC-D2.1: Smart Capture detected-type badge. Only
                renders for known types; UNKNOWN/null stays quiet. */}
            {detectedType && detectedType !== "UNKNOWN" ? (
              <span
                className={cn(
                  "shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-medium",
                  badgeClassFor(detectedType)
                )}
                title="Auto-detected by Smart Capture"
              >
                {labelForDocumentType(detectedType)}
              </span>
            ) : null}
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

      {/* DOC-D2.2: Bank statement transactions panel — renders only
          when we have a parsed ParsedBankStatement on this row.
          Shows the table + an "Import to Bank" button. */}
      {isParsedBankStatement(doc.extractedFields) ? (
        <BankStatementTransactionsPanel
          documentId={doc.id}
          documentName={doc.name}
          parsed={doc.extractedFields as unknown as ParsedBankStatement}
        />
      ) : null}

      {/* DOC-D2.1: Smart Capture extracted-text panel.
          Renders below the preview body when extraction produced text.
          Collapsible to keep the drawer body real-estate generous. */}
      {doc.extractedText ? (
        <SmartCapturePanel
          text={doc.extractedText}
          type={detectedType}
        />
      ) : null}
    </div>
  );
}

/**
 * DOC-D2.2: Renders the parsed transactions table inside the preview
 * drawer + the "Import to Bank" trigger. On Import click, fetches the
 * org's bank accounts and opens <ImportToBankDialog>.
 */
function BankStatementTransactionsPanel({
  documentId,
  documentName,
  parsed,
}: {
  documentId: string;
  documentName: string;
  parsed: ParsedBankStatement;
}) {
  const [open, setOpen] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [bankAccounts, setBankAccounts] = React.useState<
    Array<{ id: string; label: string }> | null
  >(null);
  const [loadingAccounts, setLoadingAccounts] = React.useState(false);

  async function onClickImport() {
    setLoadingAccounts(true);
    try {
      const accounts = await listBankAccountsForImportAction();
      setBankAccounts(accounts);
      setDialogOpen(true);
    } finally {
      setLoadingAccounts(false);
    }
  }

  // Format INR for display (lakh grouping).
  function inr(n: number | undefined): string {
    if (n == null) return "";
    return n.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return (
    <details
      className="shrink-0 border-t bg-muted/10"
      open={open}
      onToggle={(e) =>
        setOpen((e.currentTarget as HTMLDetailsElement).open)
      }
    >
      <summary className="cursor-pointer select-none px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 hover:bg-muted/40">
        <Landmark className="h-3.5 w-3.5" />
        <span>Smart Capture · Transactions</span>
        <span className="text-[10px] normal-case tracking-normal px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-800">
          {parsed.bank}
        </span>
        <span className="ml-auto text-[10px] normal-case tracking-normal text-muted-foreground">
          {parsed.rows.length} row{parsed.rows.length === 1 ? "" : "s"}
        </span>
        <Button
          size="sm"
          onClick={(e) => {
            e.preventDefault();
            void onClickImport();
          }}
          disabled={loadingAccounts}
          className="ml-2 h-7 text-xs normal-case tracking-normal"
        >
          {loadingAccounts ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            "Import to Bank"
          )}
        </Button>
      </summary>
      <div className="max-h-[50vh] overflow-y-auto border-t bg-background">
        {parsed.period ? (
          <div className="px-4 py-2 text-xs text-muted-foreground border-b">
            Period: {parsed.period.from} → {parsed.period.to}
            {parsed.accountNumber
              ? ` · A/C ••••${parsed.accountNumber.slice(-4)}`
              : ""}
            {parsed.openingBalance != null
              ? ` · Opening ${inr(parsed.openingBalance)}`
              : ""}
            {parsed.closingBalance != null
              ? ` · Closing ${inr(parsed.closingBalance)}`
              : ""}
          </div>
        ) : null}
        <table className="w-full text-xs">
          <thead className="bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-3 py-1.5">Date</th>
              <th className="text-left px-3 py-1.5">Description</th>
              <th className="text-right px-3 py-1.5">Debit</th>
              <th className="text-right px-3 py-1.5">Credit</th>
              <th className="text-right px-3 py-1.5">Balance</th>
            </tr>
          </thead>
          <tbody>
            {parsed.rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">
                  {r.date}
                </td>
                <td className="px-3 py-1.5 truncate max-w-[280px]" title={r.description}>
                  {r.description}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-destructive">
                  {r.debit != null ? inr(r.debit) : ""}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">
                  {r.credit != null ? inr(r.credit) : ""}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  {r.balance != null ? inr(r.balance) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bankAccounts !== null ? (
        <ImportToBankDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          documentId={documentId}
          documentName={documentName}
          rowCount={parsed.rows.length}
          bankAccounts={bankAccounts}
        />
      ) : null}
    </details>
  );
}

function SmartCapturePanel({
  text,
  type,
}: {
  text: string;
  type: ReturnType<typeof asDocumentType>;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const preview = expanded ? text : text.slice(0, 500);
  const truncated = !expanded && text.length > 500;

  return (
    <details
      className="shrink-0 border-t bg-muted/10"
      open={expanded}
      onToggle={(e) => setExpanded((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer select-none px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2 hover:bg-muted/40">
        <span>Smart Capture · Extracted Text</span>
        {type && type !== "UNKNOWN" ? (
          <span
            className={cn(
              "text-[10px] normal-case tracking-normal px-1.5 py-0.5 rounded font-medium",
              badgeClassFor(type)
            )}
          >
            Detected: {labelForDocumentType(type)}
          </span>
        ) : null}
        <span className="ml-auto text-[10px] normal-case tracking-normal text-muted-foreground">
          {text.length.toLocaleString()} chars
        </span>
      </summary>
      <div className="max-h-[40vh] overflow-y-auto px-4 py-3 text-xs font-mono whitespace-pre-wrap bg-background text-foreground/80">
        {preview}
        {truncated ? <span className="text-muted-foreground">…</span> : null}
      </div>
    </details>
  );
}
