"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Download,
  ArrowLeft,
  Loader2,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  parseManualJournalsCsvAction,
  importManualJournalsAction,
  type ImportResult,
} from "./actions";
import type {
  ParseResult,
  ParsedJournal,
} from "@/lib/accounting/manual-journals-import";

/**
 * ACCT-A.4.b — Two-step import wizard.
 *
 * 1. Upload — pick a CSV; client reads it via FileReader; server
 *    parses + validates in the caller's org scope.
 * 2. Preview — table of parsed journals + a separate panel for
 *    row errors. Big green button persists everything as DRAFT.
 */
export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState<"upload" | "preview">("upload");
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [parseResult, setParseResult] = React.useState<ParseResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large (max 2 MB)");
      return;
    }
    setBusy(true);
    setFileName(file.name);
    try {
      const text = await file.text();
      const res = await parseManualJournalsCsvAction(text);
      setParseResult(res);
      if (res.journals.length === 0 && res.errors.length === 0) {
        toast.error("Nothing to import — the file has no data rows");
        setStep("upload");
      } else {
        setStep("preview");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Parse failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!parseResult || parseResult.journals.length === 0) return;
    setBusy(true);
    try {
      const res: ImportResult = await importManualJournalsAction(
        parseResult.journals
      );
      if (res.created > 0) {
        toast.success(`Imported ${res.created} journal(s) as DRAFT`);
        router.push("/accountant/manual-journals");
        return;
      }
      toast.error("No journals imported — see errors above");
      setBusy(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      if (msg.startsWith("NEXT_REDIRECT")) return;
      toast.error(msg);
      setBusy(false);
    }
  }

  function reset() {
    setStep("upload");
    setFileName(null);
    setParseResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (step === "upload") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base inline-flex items-center gap-2">
            <Upload className="h-4 w-4" /> Step 1 of 2 — Upload CSV
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertDescription className="text-sm space-y-2">
              <p>
                Upload a CSV with the same column headers as the{" "}
                <b>Bulk Export</b>. Required columns:{" "}
                <code className="text-xs">Date</code>,{" "}
                <code className="text-xs">Journal Number</code>,{" "}
                <code className="text-xs">Account Code</code>,{" "}
                <code className="text-xs">Debit</code>,{" "}
                <code className="text-xs">Credit</code>.
              </p>
              <p>
                All imported journals are saved as <b>DRAFT</b> — review
                and publish them from the list page.
              </p>
              <Button asChild variant="link" size="sm" className="px-0 h-auto">
                <a href="/accountant/manual-journals/export">
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
        </CardContent>
      </Card>
    );
  }

  // step === "preview"
  const { journals, errors, totalRows } = parseResult!;
  const totalDebit = journals.reduce(
    (s, j) => s + j.lines.reduce((ls, l) => ls + l.debit, 0),
    0
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base inline-flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Step 2 of 2 — Preview &amp; Confirm
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="File" value={fileName ?? "—"} mono />
            <Stat label="Rows scanned" value={String(totalRows)} />
            <Stat
              label="Valid journals"
              value={String(journals.length)}
              tone="success"
            />
            <Stat
              label="Row errors"
              value={String(errors.length)}
              tone={errors.length > 0 ? "danger" : "muted"}
            />
          </div>
          <div className="text-xs text-muted-foreground">
            Σ Debit of valid journals: <b>{totalDebit.toFixed(2)}</b>
          </div>
        </CardContent>
      </Card>

      {errors.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base inline-flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" /> Errors ({errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left p-2 w-16">Row</th>
                  <th className="text-left p-2 w-32">Field</th>
                  <th className="text-left p-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {errors.map((e, i) => (
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
          </CardContent>
        </Card>
      )}

      {journals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Valid journals ({journals.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left p-3">Number</th>
                  <th className="text-left p-3">Date</th>
                  <th className="text-left p-3">Reference</th>
                  <th className="text-right p-3">Lines</th>
                  <th className="text-right p-3">Total Debit</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {journals.slice(0, 50).map((j: ParsedJournal) => {
                  const total = j.lines.reduce((s, l) => s + l.debit, 0);
                  return (
                    <tr key={j.number}>
                      <td className="p-3 font-mono text-xs">{j.number}</td>
                      <td className="p-3">
                        {j.date.toISOString().slice(0, 10)}
                      </td>
                      <td className="p-3 text-xs">
                        {j.referenceNumber ?? (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {j.lines.length}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {total.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {journals.length > 50 && (
              <div className="p-3 text-xs text-muted-foreground text-center bg-muted/20">
                +{journals.length - 50} more journal
                {journals.length - 50 === 1 ? "" : "s"} (full list will import)
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={reset}
          disabled={busy}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> Pick another file
        </Button>
        <Button
          type="button"
          onClick={handleImport}
          disabled={busy || journals.length === 0}
          className="gap-1"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Import {journals.length} journal{journals.length === 1 ? "" : "s"}{" "}
          as <Badge variant="secondary" className="ml-1">Draft</Badge>
        </Button>
      </div>
    </div>
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

