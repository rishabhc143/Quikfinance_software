"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { useDropzone } from "react-dropzone";
import { Upload, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { importItemsAction } from "../actions";
import { toast } from "sonner";

type Step = 1 | 2 | 3;

const TARGET_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "type", label: "Type (GOODS/SERVICE)", required: false },
  { key: "unit", label: "Unit", required: false },
  { key: "sellingPrice", label: "Selling Price", required: false },
  { key: "salesDescription", label: "Sales Description", required: false },
  { key: "costPrice", label: "Cost Price", required: false },
  { key: "purchaseDescription", label: "Purchase Description", required: false },
] as const;

type TargetKey = (typeof TARGET_FIELDS)[number]["key"];

export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);
  const [file, setFile] = React.useState<File | null>(null);
  const [duplicateHandling, setDuplicateHandling] = React.useState<"skip" | "overwrite">("skip");
  const [encoding, setEncoding] = React.useState("UTF-8");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [rows, setRows] = React.useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = React.useState<Record<TargetKey, string>>({
    name: "", type: "", unit: "", sellingPrice: "", salesDescription: "", costPrice: "", purchaseDescription: "",
  });
  const [busy, setBusy] = React.useState(false);

  const onDrop = React.useCallback((accepted: File[]) => {
    const f = accepted[0];
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { toast.error("File must be 25MB or smaller"); return; }
    setFile(f);
  }, []);

  const dropzone = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "text/tab-separated-values": [".tsv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
    },
    maxFiles: 1,
  });

  async function parseAndAdvance() {
    if (!file) return;
    if (!file.name.endsWith(".csv") && !file.name.endsWith(".tsv")) {
      toast.error("XLS/XLSX support is currently parse-only via CSV. Save as CSV and re-upload for now.");
      return;
    }
    setBusy(true);
    const text = await file.text();
    const parsed = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      delimiter: file.name.endsWith(".tsv") ? "\t" : undefined,
    });
    setBusy(false);
    if (parsed.errors.length > 0) {
      toast.error(`CSV parse error: ${parsed.errors[0].message}`);
      return;
    }
    const data = parsed.data;
    const cols = Object.keys(data[0] ?? {});
    setHeaders(cols);
    setRows(data);

    // Auto-map: case-insensitive match on label and key
    const auto: Partial<Record<TargetKey, string>> = {};
    for (const target of TARGET_FIELDS) {
      const tHay = [target.key, target.label].map((s) => s.toLowerCase().replace(/[\s()/]+/g, ""));
      const match = cols.find((c) => tHay.includes(c.toLowerCase().replace(/[\s()/]+/g, "")));
      if (match) auto[target.key] = match;
    }
    setMapping((m) => ({ ...m, ...auto }));
    setStep(2);
  }

  function previewRows() {
    return rows.slice(0, 10).map((row) => {
      const out: Record<string, string> = {};
      for (const target of TARGET_FIELDS) {
        const src = mapping[target.key];
        out[target.key] = src ? row[src] ?? "" : "";
      }
      return out;
    });
  }

  function validationErrors(): string[] {
    const errs: string[] = [];
    if (!mapping.name) errs.push("Name column must be mapped");
    return errs;
  }

  async function commit() {
    setBusy(true);
    try {
      const payload = rows.map((row) => ({
        name: row[mapping.name]?.trim(),
        type: (mapping.type ? row[mapping.type]?.toUpperCase() : "GOODS") === "SERVICE" ? "SERVICE" as const : "GOODS" as const,
        unit: mapping.unit ? row[mapping.unit] || null : null,
        sellingPrice: mapping.sellingPrice && row[mapping.sellingPrice] ? Number(row[mapping.sellingPrice]) : null,
        salesDescription: mapping.salesDescription ? row[mapping.salesDescription] || null : null,
        costPrice: mapping.costPrice && row[mapping.costPrice] ? Number(row[mapping.costPrice]) : null,
        purchaseDescription: mapping.purchaseDescription ? row[mapping.purchaseDescription] || null : null,
      })).filter((r) => r.name);

      const result = await importItemsAction({ rows: payload, duplicateHandling });
      toast.success(`Imported ${result.created} items, updated ${result.updated}, skipped ${result.skipped}`);
      router.push("/items");
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Import failed";
      toast.error(msg);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Stepper step={step} />

      {step === 1 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Step 1 — Configure</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <div
              {...dropzone.getRootProps()}
              className="border-2 border-dashed rounded-md p-8 text-center cursor-pointer hover:bg-muted/30"
            >
              <input {...dropzone.getInputProps()} />
              <Upload className="h-8 w-8 mx-auto opacity-60 mb-2" />
              {file ? (
                <div className="text-sm">
                  <div className="font-medium flex items-center justify-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    {file.name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB · click to change</div>
                </div>
              ) : (
                <div>
                  <div className="font-medium">Drag &amp; drop a file</div>
                  <Button type="button" variant="outline" size="sm" className="mt-2">Choose File</Button>
                  <div className="text-xs text-muted-foreground mt-2">CSV, TSV, XLS, XLSX · max 25MB</div>
                </div>
              )}
            </div>

            <div>
              <a href="/templates/items-import-sample.csv" download className="text-sm text-primary hover:underline">
                Download a sample file…
              </a>
            </div>

            <div>
              <Label className="block mb-2">Duplicate Handling <span className="text-destructive">*</span></Label>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={duplicateHandling === "skip"} onChange={() => setDuplicateHandling("skip")} />
                  Skip Duplicates <span className="text-muted-foreground">(default)</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={duplicateHandling === "overwrite"} onChange={() => setDuplicateHandling("overwrite")} />
                  Overwrite items
                </label>
              </div>
            </div>

            <div>
              <Label htmlFor="encoding">Character Encoding</Label>
              <select
                id="encoding"
                value={encoding}
                onChange={(e) => setEncoding(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option>UTF-8 (Unicode)</option>
                <option>Western European (ISO-8859-1)</option>
                <option>Western European (Windows-1252)</option>
              </select>
            </div>

            <Alert variant="info">
              <AlertDescription>
                <strong>Tips:</strong>
                <ul className="list-disc list-inside mt-1 text-xs space-y-0.5">
                  <li>Map your existing GST treatments into Quikfinance tax codes after import.</li>
                  <li>Use a CSV converter if your accounting tool exports XLS variants Quikfinance does not yet parse.</li>
                </ul>
              </AlertDescription>
            </Alert>

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => router.push("/items")}>Cancel</Button>
              <Button onClick={parseAndAdvance} disabled={!file || busy}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Step 2 — Map Fields</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Match your file&apos;s columns to Quikfinance fields. Auto-mapped fields are pre-selected.
            </div>
            <div className="rounded-md border divide-y">
              {TARGET_FIELDS.map((target) => {
                const isMapped = !!mapping[target.key];
                return (
                  <div key={target.key} className="grid grid-cols-3 items-center gap-3 p-3 text-sm">
                    <div>
                      <div className="font-medium">
                        {target.label}
                        {target.required && <span className="text-destructive ml-1">*</span>}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground justify-self-center" />
                    <select
                      value={mapping[target.key]}
                      onChange={(e) => setMapping((m) => ({ ...m, [target.key]: e.target.value }))}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">{target.required ? "Select column" : "Unmapped"}</option>
                      {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                    {!isMapped && !target.required && (
                      <div className="col-start-3 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> Unmapped
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={() => {
                const errs = validationErrors();
                if (errs.length > 0) { toast.error(errs[0]); return; }
                setStep(3);
              }}>
                Next <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Step 3 — Preview</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Showing the first 10 of <strong>{rows.length}</strong> rows as they would be imported. Validation errors are highlighted.
            </div>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 uppercase tracking-wider text-muted-foreground">
                  <tr>
                    {TARGET_FIELDS.map((t) => (
                      <th key={t.key} className="text-left p-2">{t.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {previewRows().map((r, i) => {
                    const missingName = !r.name;
                    return (
                      <tr key={i} className={missingName ? "bg-destructive/5" : ""}>
                        {TARGET_FIELDS.map((t) => (
                          <td key={t.key} className="p-2 truncate max-w-[200px]">{r[t.key] || <span className="text-muted-foreground">—</span>}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Alert variant="info">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Duplicate handling: <strong>{duplicateHandling === "skip" ? "Skip duplicates" : "Overwrite items"}</strong>
              </AlertDescription>
            </Alert>

            <div className="flex items-center justify-between gap-2 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setStep(2)} disabled={busy}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Back
              </Button>
              <Button onClick={commit} disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Import {rows.length} item{rows.length === 1 ? "" : "s"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const labels = ["Configure", "Map Fields", "Preview"];
  return (
    <ol className="flex items-center gap-2 text-xs">
      {labels.map((l, i) => {
        const idx = (i + 1) as Step;
        const active = idx === step;
        const done = idx < step;
        return (
          <li key={l} className="flex items-center gap-2">
            <span className={`h-6 w-6 rounded-full grid place-items-center text-[10px] font-medium ${done ? "bg-primary text-primary-foreground" : active ? "bg-primary/20 text-primary border border-primary" : "bg-muted text-muted-foreground"}`}>
              {idx}
            </span>
            <span className={active ? "font-medium" : "text-muted-foreground"}>{l}</span>
            {idx < 3 && <span className="w-8 h-px bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}
