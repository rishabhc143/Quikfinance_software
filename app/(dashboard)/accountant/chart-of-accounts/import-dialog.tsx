"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
  FileText,
  X,
  ArrowLeft,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  parseCoaCsvAction,
  importCoaAction,
  type ImportResult,
} from "./import-actions";
import type { ParseResult } from "@/lib/accounting/coa-import";

const TYPE_LABEL: Record<string, string> = {
  ASSET: "Asset",
  LIABILITY: "Liability",
  EQUITY: "Equity",
  INCOME: "Income",
  EXPENSE: "Expense",
  COST_OF_GOODS_SOLD: "Cost of Goods Sold",
  OTHER_INCOME: "Other Income",
  OTHER_EXPENSE: "Other Expense",
};

/**
 * ACCT-E.4 — Two-step Chart of Accounts CSV import dialog.
 *
 *   1. Upload — pick a CSV; server parses + validates.
 *   2. Preview — see valid rows + per-row errors; click Import.
 *
 * Uses the same parser pattern as the Manual Journals import
 * wizard from ACCT-A.4.b — RFC 4180 CSV, required columns,
 * row-by-row error reporting, partial-success semantics.
 */
export function ImportCoaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<"upload" | "preview">("upload");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [parseResult, setParseResult] = React.useState<ParseResult | null>(
    null
  );
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  function reset() {
    setStep("upload");
    setFileName(null);
    setParseResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  React.useEffect(() => {
    if (!open) reset();
  }, [open]);

  async function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large (max 2 MB)");
      return;
    }
    setBusy(true);
    setFileName(file.name);
    try {
      const text = await file.text();
      const res = await parseCoaCsvAction(text);
      setParseResult(res);
      if (res.rows.length === 0 && res.errors.length === 0) {
        toast.error("Nothing to import — the file has no data rows");
        setStep("upload");
      } else {
        setStep("preview");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Parse failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!parseResult || parseResult.rows.length === 0) return;
    setBusy(true);
    try {
      const res: ImportResult = await importCoaAction(parseResult.rows);
      if (res.created > 0) {
        const pieces = [
          `Imported ${res.created} account${res.created === 1 ? "" : "s"}`,
        ];
        if (res.skipped > 0)
          pieces.push(`${res.skipped} skipped (existing names/codes)`);
        toast.success(pieces.join(" · "));
        onOpenChange(false);
        router.refresh();
        return;
      }
      toast.error("No accounts imported — see errors above");
      setBusy(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl p-0 gap-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="text-base font-semibold">
            Import Chart of Accounts
          </DialogTitle>
          <DialogClose className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        {step === "upload" ? (
          <div className="p-6 space-y-4">
            <Alert>
              <AlertDescription className="text-sm space-y-2">
                <p>
                  Upload a CSV with the same column headers as the export:{" "}
                  <code className="text-xs">Account Code</code>,{" "}
                  <code className="text-xs">Account Name</code> (required),{" "}
                  <code className="text-xs">Account Type</code> (required),{" "}
                  <code className="text-xs">Sub-type</code>,{" "}
                  <code className="text-xs">Description</code>,{" "}
                  <code className="text-xs">Status</code>.
                </p>
                <Button asChild variant="link" size="sm" className="px-0 h-auto">
                  <a href="/accountant/chart-of-accounts/export">
                    <Download className="h-3.5 w-3.5 mr-1" />
                    Download current data as template
                  </a>
                </Button>
              </AlertDescription>
            </Alert>

            <label
              className={
                "block border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:bg-muted/30 transition-colors " +
                (busy ? "opacity-60 pointer-events-none" : "")
              }
            >
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
              />
              <div className="space-y-2">
                {busy ? (
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                ) : (
                  <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
                )}
                <div className="text-sm font-medium">
                  {busy ? "Parsing…" : "Click to pick a CSV (max 2 MB)"}
                </div>
                <div className="text-xs text-muted-foreground">
                  or drop one in
                </div>
              </div>
            </label>
          </div>
        ) : (
          <>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <Stat label="File" value={fileName ?? "—"} mono />
                <Stat
                  label="Rows scanned"
                  value={String(parseResult!.totalRows)}
                />
                <Stat
                  label="Valid rows"
                  value={String(parseResult!.rows.length)}
                  tone="success"
                />
                <Stat
                  label="Row errors"
                  value={String(parseResult!.errors.length)}
                  tone={parseResult!.errors.length > 0 ? "danger" : "muted"}
                />
              </div>
            </div>

            {parseResult!.errors.length > 0 && (
              <div className="border-t border-destructive/20 bg-destructive/5 p-4">
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  Errors ({parseResult!.errors.length})
                </div>
                <div className="max-h-40 overflow-auto rounded-md border bg-background">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30">
                      <tr>
                        <th className="text-left p-2 w-16">Row</th>
                        <th className="text-left p-2 w-32">Field</th>
                        <th className="text-left p-2">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {parseResult!.errors.map((e, i) => (
                        <tr key={i}>
                          <td className="p-2 font-mono">{e.row}</td>
                          <td className="p-2 text-muted-foreground">
                            {e.field ?? "—"}
                          </td>
                          <td className="p-2">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {parseResult!.rows.length > 0 && (
              <div className="border-t">
                <div className="px-4 py-2 flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Valid rows ({parseResult!.rows.length})
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="text-left p-2">Code</th>
                        <th className="text-left p-2">Name</th>
                        <th className="text-left p-2">Type</th>
                        <th className="text-left p-2">Sub-type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {parseResult!.rows.slice(0, 100).map((r, i) => (
                        <tr key={i}>
                          <td className="p-2 font-mono text-xs">
                            {r.code ?? "—"}
                          </td>
                          <td className="p-2">{r.name}</td>
                          <td className="p-2 text-xs">
                            {TYPE_LABEL[r.type] ?? r.type}
                          </td>
                          <td className="p-2 text-xs text-muted-foreground">
                            {r.subType ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parseResult!.rows.length > 100 && (
                    <div className="p-2 text-xs text-muted-foreground text-center bg-muted/20">
                      +{parseResult!.rows.length - 100} more (full list will
                      import)
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 p-4 border-t bg-muted/20">
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                disabled={busy}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                Pick another file
              </Button>
              <Button
                type="button"
                onClick={handleImport}
                disabled={busy || parseResult!.rows.length === 0}
              >
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Import {parseResult!.rows.length}{" "}
                row{parseResult!.rows.length === 1 ? "" : "s"}
                <Badge variant="secondary" className="ml-2">
                  <Upload className="h-3 w-3 mr-1" /> Active
                </Badge>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({
  label,
  value,
  mono,
  tone,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "success" | "danger" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-destructive"
        : "";
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          "font-semibold " + (mono ? "font-mono text-sm " : "") + toneClass
        }
      >
        {value}
      </div>
    </div>
  );
}
