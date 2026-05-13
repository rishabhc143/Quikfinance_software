"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  autoDetectColumnMap,
  type AmountColumnType,
  type CsvColumnMap,
  type ParsedRow,
} from "@/lib/banking/csv-import";
import {
  detectFormat,
  type BankStatementFormat,
} from "@/lib/banking/format-detection";
import { parseQif } from "@/lib/banking/parsers/qif";
import { parseOfx } from "@/lib/banking/parsers/ofx";
import { parseCamt053 } from "@/lib/banking/parsers/camt053";
import {
  importBankStatementAction,
  saveImportPresetAction,
  type ImportResult,
} from "../actions";

const FORMAT_LABEL: Record<BankStatementFormat, string> = {
  CSV: "CSV / TSV",
  OFX: "OFX (Open Financial Exchange)",
  QIF: "QIF (Quicken Interchange Format)",
  CAMT053: "CAMT.053 (ISO 20022 statement)",
};

const STEPS = ["Upload", "Mapping", "Preview", "Done"] as const;

type Preset = {
  id: string;
  name: string;
  amountColumnType: string;
  encoding: string;
  delimiter: string;
  columnMapJson: Record<string, unknown>;
};

type Props = {
  bankAccountId: string;
  currency: string;
  presets: Preset[];
};

/**
 * BNK-A — 4-step CSV-import wizard. Mirrors Zoho's documented column-
 * mapping flow (Upload → Mapping → Preview → Done). Auto-detects the
 * column map on upload via lib/banking/csv-import.ts; user can override
 * each column + the Amount-column-type before submitting.
 *
 * Column parsing happens twice — once on the client for live preview,
 * once on the server (the canonical version) inside
 * importBankStatementAction. Server result is what actually populates
 * the BankTransaction rows + the import batch.
 */
export function ImportBankStatementWizard({
  bankAccountId,
  currency,
  presets,
}: Props) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [csvText, setCsvText] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [previewRows, setPreviewRows] = React.useState<
    Record<string, string>[]
  >([]);
  const [columnMap, setColumnMap] = React.useState<CsvColumnMap>({
    date: "",
    amountColumnType: "SINGLE_NEGATIVE",
  });
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [presetName, setPresetName] = React.useState("");
  // BNK-G — current statement format. Set on file pick; non-CSV
  // formats skip the column-mapping step entirely.
  const [format, setFormat] = React.useState<BankStatementFormat>("CSV");
  // For non-CSV formats: client-side preview rows (already structured
  // ParsedRow[] rather than the CSV's free-form record map).
  const [parsedPreviewRows, setParsedPreviewRows] = React.useState<
    ParsedRow[]
  >([]);
  const [parsedTotal, setParsedTotal] = React.useState(0);

  async function onFileChange(file: File | null) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5 MB)");
      return;
    }
    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);

    // BNK-G — detect format from filename + content sample.
    const detected = detectFormat(file.name, text);
    setFormat(detected);

    if (detected === "CSV") {
      // Existing CSV flow — parse headers, build the auto-detect map.
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) {
        toast.error("CSV needs at least a header row + 1 data row");
        return;
      }
      const head = lines[0].split(",").map((h) => h.trim());
      setHeaders(head);

      const preview = lines.slice(1, 11).map((line) => {
        const cells = line.split(",");
        const r: Record<string, string> = {};
        head.forEach((h, i) => {
          r[h] = (cells[i] ?? "").trim();
        });
        return r;
      });
      setPreviewRows(preview);
      // Reset non-CSV state so a previous OFX upload doesn't bleed in.
      setParsedPreviewRows([]);
      setParsedTotal(0);

      const map = autoDetectColumnMap(head);
      setColumnMap({
        date: map.date ?? head[0] ?? "",
        description: map.description,
        reference: map.reference,
        amountColumnType: map.amountColumnType ?? "SINGLE_NEGATIVE",
        debit: map.debit,
        credit: map.credit,
        amount: map.amount,
        amountType: map.amountType,
      });
    } else {
      // BNK-G — OFX/QIF/CAMT.053: parse client-side, skip mapping.
      const parser =
        detected === "OFX"
          ? parseOfx
          : detected === "QIF"
            ? parseQif
            : parseCamt053;
      const result = parser(text);
      if (result.errors.length > 0 && result.rows.length === 0) {
        toast.error(result.errors[0].message);
        return;
      }
      setParsedTotal(result.rows.length);
      setParsedPreviewRows(result.rows.slice(0, 10));
      // Reset CSV-only state.
      setHeaders([]);
      setPreviewRows([]);
      // Jump straight to the Preview step (skips mapping).
      setStep(2);
      toast.success(
        `${FORMAT_LABEL[detected]} detected · ${result.rows.length} transactions`
      );
    }
  }

  function applyPreset(p: Preset) {
    const map = p.columnMapJson as unknown as CsvColumnMap;
    setColumnMap(map);
    toast.success(`Loaded preset "${p.name}"`);
  }

  async function runImport() {
    if (!csvText) {
      toast.error("Upload a file first");
      return;
    }
    if (format === "CSV" && !columnMap.date) {
      toast.error("Pick the Date column");
      return;
    }
    setBusy(true);
    try {
      const r = await importBankStatementAction({
        bankAccountId,
        csvText,
        fileName,
        format,
        columnMap: format === "CSV" ? columnMap : undefined,
      });
      setResult(r);
      setStep(3);
      if (r.errors.length === 0 && r.duplicates === 0) {
        toast.success(`Imported ${r.inserted} transactions`);
      } else if (r.duplicates > 0) {
        toast.warning(
          `Imported ${r.inserted} (${r.duplicates} marked as duplicate)`
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

  async function savePreset() {
    if (!presetName.trim()) {
      toast.error("Give the preset a name first");
      return;
    }
    const r = await saveImportPresetAction({
      bankAccountId,
      name: presetName,
      columnMap,
    });
    if (r.ok) {
      toast.success(`Preset "${presetName}" saved`);
      setPresetName("");
    } else {
      toast.error(r.error ?? "Save failed");
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
                i <= step
                  ? "bg-primary text-primary-foreground border-primary"
                  : ""
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

      <Card>
        <CardContent className="pt-6 space-y-4">
          {step === 0 ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="file">Upload statement</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".csv,.tsv,.txt,.ofx,.qfx,.qif,.xml,text/csv"
                    onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Max 5 MB. Supports CSV / TSV, OFX, QIF, and CAMT.053
                    (ISO 20022) XML.
                  </p>
                  {csvText && format !== "CSV" ? (
                    <p className="text-xs text-emerald-700 dark:text-emerald-400">
                      Detected: {FORMAT_LABEL[format]} — column mapping not
                      needed.
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label>Saved presets</Label>
                  {presets.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">
                      No presets yet. Save the mapping at the end of this
                      import for next month&apos;s upload.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {presets.map((p) => (
                        <Button
                          key={p.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => applyPreset(p)}
                        >
                          {p.name}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={() => setStep(format === "CSV" ? 1 : 2)}
                  disabled={!csvText}
                  className="gap-1"
                >
                  <Upload className="h-4 w-4" />
                  {format === "CSV"
                    ? "Continue to mapping"
                    : "Continue to preview"}
                </Button>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <Label>Date column</Label>
                  <select
                    value={columnMap.date}
                    onChange={(e) =>
                      setColumnMap({ ...columnMap, date: e.target.value })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">— pick a column —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Description column</Label>
                  <select
                    value={columnMap.description ?? ""}
                    onChange={(e) =>
                      setColumnMap({
                        ...columnMap,
                        description: e.target.value || undefined,
                      })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">— optional —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Reference column</Label>
                  <select
                    value={columnMap.reference ?? ""}
                    onChange={(e) =>
                      setColumnMap({
                        ...columnMap,
                        reference: e.target.value || undefined,
                      })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">— optional —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Amount column type</Label>
                  <select
                    value={columnMap.amountColumnType}
                    onChange={(e) =>
                      setColumnMap({
                        ...columnMap,
                        amountColumnType: e.target.value as AmountColumnType,
                      })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="DOUBLE">
                      Double Column (separate Debit + Credit)
                    </option>
                    <option value="SINGLE_WITH_TYPE">
                      Single Column with Type (DR/CR)
                    </option>
                    <option value="SINGLE_NEGATIVE">
                      Single Column with Negatives
                    </option>
                  </select>
                </div>
                {columnMap.amountColumnType === "DOUBLE" ? (
                  <>
                    <div className="space-y-1">
                      <Label>Debit column</Label>
                      <select
                        value={columnMap.debit ?? ""}
                        onChange={(e) =>
                          setColumnMap({
                            ...columnMap,
                            debit: e.target.value || undefined,
                          })
                        }
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">— pick —</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label>Credit column</Label>
                      <select
                        value={columnMap.credit ?? ""}
                        onChange={(e) =>
                          setColumnMap({
                            ...columnMap,
                            credit: e.target.value || undefined,
                          })
                        }
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">— pick —</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-1">
                      <Label>Amount column</Label>
                      <select
                        value={columnMap.amount ?? ""}
                        onChange={(e) =>
                          setColumnMap({
                            ...columnMap,
                            amount: e.target.value || undefined,
                          })
                        }
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="">— pick —</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                    {columnMap.amountColumnType === "SINGLE_WITH_TYPE" ? (
                      <div className="space-y-1">
                        <Label>Type column (DR/CR)</Label>
                        <select
                          value={columnMap.amountType ?? ""}
                          onChange={(e) =>
                            setColumnMap({
                              ...columnMap,
                              amountType: e.target.value || undefined,
                            })
                          }
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >
                          <option value="">— pick —</option>
                          {headers.map((h) => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              <div className="flex justify-between pt-2 border-t">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button
                  onClick={() => setStep(2)}
                  disabled={!columnMap.date}
                  className="gap-1"
                >
                  Continue to preview
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                {format === "CSV" ? (
                  <>
                    Preview of the first {previewRows.length} row
                    {previewRows.length === 1 ? "" : "s"}:
                  </>
                ) : (
                  <>
                    {FORMAT_LABEL[format]} — preview of {parsedPreviewRows.length}{" "}
                    of {parsedTotal} parsed transaction
                    {parsedTotal === 1 ? "" : "s"}:
                  </>
                )}
              </div>
              <div className="overflow-x-auto rounded-md border">
                {format === "CSV" ? (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        {headers.map((h) => (
                          <th key={h} className="p-2 text-left">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {previewRows.map((r, i) => (
                        <tr key={i}>
                          {headers.map((h) => (
                            <td key={h} className="p-2 align-top">
                              {r[h]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">Date</th>
                        <th className="p-2 text-left">Description</th>
                        <th className="p-2 text-left">Reference</th>
                        <th className="p-2 text-right">Amount</th>
                        <th className="p-2 text-left">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {parsedPreviewRows.map((r, i) => (
                        <tr key={i}>
                          <td className="p-2 align-top tabular-nums">
                            {r.date.toISOString().slice(0, 10)}
                          </td>
                          <td className="p-2 align-top">
                            {r.description ?? "—"}
                          </td>
                          <td className="p-2 align-top font-mono">
                            {r.reference ?? "—"}
                          </td>
                          <td className="p-2 align-top text-right tabular-nums">
                            {r.amount.toFixed(2)}
                          </td>
                          <td className="p-2 align-top">{r.type}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div className="flex justify-between pt-2 border-t">
                <Button
                  variant="ghost"
                  onClick={() => setStep(format === "CSV" ? 1 : 0)}
                >
                  {format === "CSV" ? "Back to mapping" : "Back to upload"}
                </Button>
                <Button
                  onClick={runImport}
                  disabled={busy}
                  className="gap-1"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Import{" "}
                  {format === "CSV"
                    ? `${previewRows.length}+ transactions`
                    : `${parsedTotal} transaction${parsedTotal === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>
          ) : null}

          {step === 3 && result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-base font-medium">
                {result.errors.length === 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                )}
                Import{" "}
                {result.errors.length === 0
                  ? "complete"
                  : "finished with warnings"}
              </div>
              <div className="grid gap-3 sm:grid-cols-4 text-center">
                <Stat label="Parsed" value={result.parsed} />
                <Stat label="Inserted" value={result.inserted} />
                <Stat label="Duplicates" value={result.duplicates} />
                <Stat label="Errors" value={result.errors.length} />
              </div>
              {result.errors.length > 0 ? (
                <div className="rounded-md border">
                  <div className="p-3 border-b bg-muted/40 text-sm font-medium">
                    Row errors
                  </div>
                  <ul className="text-xs divide-y">
                    {result.errors.slice(0, 50).map((e, i) => (
                      <li key={i} className="p-2">
                        <span className="font-mono text-muted-foreground">
                          row {e.rowNumber}
                        </span>
                        : {e.message}
                      </li>
                    ))}
                    {result.errors.length > 50 ? (
                      <li className="p-2 text-muted-foreground">
                        … and {result.errors.length - 50} more
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
              <div className="border-t pt-4 space-y-2">
                <Label className="text-sm">
                  Save this column mapping for next time?
                </Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. ICICI monthly statement"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    onClick={savePreset}
                    disabled={!presetName.trim()}
                  >
                    Save Preset
                  </Button>
                </div>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStep(0);
                    setResult(null);
                    setCsvText("");
                    setFileName("");
                    setHeaders([]);
                    setPreviewRows([]);
                  }}
                >
                  Import another file
                </Button>
                <Button
                  onClick={() =>
                    router.push(`/banking/accounts/${bankAccountId}`)
                  }
                >
                  Back to {currency} account
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
