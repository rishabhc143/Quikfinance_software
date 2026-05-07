"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const STEPS = ["Configure", "Preview", "Done"] as const;

export type SalesImportResult = {
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

/**
 * Shared import wizard for tier-1 Sales sub-modules (Quotes / Sales Orders /
 * Invoices). Two dup-handling modes per spec ("Skip/Overwrite for the
 * rest"); Customer import adds a third mode and uses its own wizard.
 */
export function SalesImportWizard({
  entityLabel,
  sampleCsv,
  sampleFilename,
  redirectAfter,
  action,
}: {
  entityLabel: string;
  sampleCsv: string;
  sampleFilename: string;
  redirectAfter: string;
  action: (input: {
    csvText: string;
    dupHandling: "skip" | "overwrite";
  }) => Promise<SalesImportResult>;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [csvText, setCsvText] = React.useState("");
  const [dupHandling, setDupHandling] = React.useState<"skip" | "overwrite">(
    "skip"
  );
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<SalesImportResult | null>(null);

  const previewRows = React.useMemo(() => {
    if (!csvText) return [];
    const lines = csvText.trim().split(/\r?\n/);
    const head = lines[0]?.split(",") ?? [];
    return lines.slice(1, 11).map((line) => {
      const cells = line.split(",");
      const r: Record<string, string> = {};
      head.forEach((h, i) => {
        r[h] = cells[i] ?? "";
      });
      return r;
    });
  }, [csvText]);

  function downloadSample() {
    const blob = new Blob([sampleCsv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sampleFilename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function onFileChange(file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5 MB)");
      return;
    }
    const text = await file.text();
    setCsvText(text);
  }

  async function runImport() {
    setBusy(true);
    try {
      const r = await action({ csvText, dupHandling });
      setResult(r);
      setStep(2);
      if (r.errors.length === 0) {
        toast.success(
          `Imported ${r.created} created, ${r.updated} updated, ${r.skipped} skipped`
        );
      } else {
        toast.warning(`${r.errors.length} rows had errors`);
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <ol className="flex items-center gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`flex items-center gap-2 ${
              i === step
                ? "text-foreground font-semibold"
                : i < step
                ? "text-muted-foreground"
                : "text-muted-foreground/60"
            }`}
          >
            <span
              className={`h-5 w-5 rounded-full border flex items-center justify-center ${
                i <= step ? "bg-primary text-primary-foreground border-primary" : ""
              }`}
            >
              {i + 1}
            </span>
            {s}
            {i < STEPS.length - 1 ? (
              <span className="text-muted-foreground/50">›</span>
            ) : null}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-lg font-semibold">Import {entityLabel}</h2>
            <div className="rounded-md border-dashed border-2 p-6 text-center">
              <FileSpreadsheet
                className="h-10 w-10 mx-auto text-muted-foreground"
                aria-hidden
              />
              <p className="mt-2 text-sm">Upload a CSV file</p>
              <Input
                type="file"
                accept=".csv"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                className="mt-3 max-w-md mx-auto"
              />
              <Button variant="link" size="sm" onClick={downloadSample}>
                Download sample CSV
              </Button>
            </div>

            <div>
              <Label>Duplicate Handling</Label>
              <div className="mt-2 space-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="dup"
                    checked={dupHandling === "skip"}
                    onChange={() => setDupHandling("skip")}
                  />
                  Skip Duplicates (default)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="dup"
                    checked={dupHandling === "overwrite"}
                    onChange={() => setDupHandling("overwrite")}
                  />
                  Overwrite existing rows
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => router.push(redirectAfter)}>
                Cancel
              </Button>
              <Button disabled={!csvText} onClick={() => setStep(1)}>
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <h2 className="text-lg font-semibold">Preview</h2>
            <p className="text-sm text-muted-foreground">
              Showing first {previewRows.length} rows.
            </p>
            <div className="overflow-x-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    {Object.keys(previewRows[0] ?? {}).map((k) => (
                      <th key={k} className="p-2 text-left">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {previewRows.map((r, i) => (
                    <tr key={i}>
                      {Object.keys(previewRows[0] ?? {}).map((k) => (
                        <td key={k} className="p-2">
                          {r[k] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button onClick={runImport} disabled={busy} className="gap-1">
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Import
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 && result ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-center gap-2">
              {result.errors.length === 0 ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              ) : (
                <AlertCircle className="h-6 w-6 text-amber-600" />
              )}
              <h2 className="text-lg font-semibold">Import complete</h2>
            </div>
            <ul className="text-sm space-y-1">
              <li>Parsed: {result.parsed}</li>
              <li>Created: {result.created}</li>
              <li>Updated: {result.updated}</li>
              <li>Skipped: {result.skipped}</li>
              <li
                className={
                  result.errors.length > 0 ? "text-amber-700" : ""
                }
              >
                Errors: {result.errors.length}
              </li>
            </ul>
            {result.errors.length > 0 ? (
              <details className="text-xs">
                <summary className="cursor-pointer">Show error details</summary>
                <ul className="mt-2 space-y-1">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
            <div className="pt-2">
              <Button onClick={() => router.push(redirectAfter)}>Done</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
