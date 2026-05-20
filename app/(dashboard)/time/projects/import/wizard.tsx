"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  X,
  Download,
  ChevronDown,
  HelpCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { importProjectsAction } from "./actions";
import { SAMPLE_PROJECTS_CSV } from "./sample";

const MAX_FILE_SIZE_MB = 25;
const ACCEPTED_EXTENSIONS = ".csv,.tsv,.xls";

const STEPS = ["Configure", "Map Fields", "Preview"] as const;

const TARGET_FIELDS = [
  { value: "name", label: "Project Name", required: true },
  { value: "projectCode", label: "Project Code", required: false },
  { value: "customerName", label: "Customer Name", required: true },
  { value: "billingMethod", label: "Billing Method", required: true },
  { value: "description", label: "Description", required: false },
  { value: "costBudget", label: "Cost Budget", required: false },
  { value: "revenueBudget", label: "Revenue Budget", required: false },
  { value: "", label: "— Skip this column —", required: false },
] as const;

type TargetField = (typeof TARGET_FIELDS)[number]["value"];

/**
 * Auto-map: look at each CSV header and try to match it (case-insensitive,
 * spaces tolerant) to one of the target fields.
 */
function autoMap(headers: string[]): Record<string, TargetField> {
  const out: Record<string, TargetField> = {};
  for (const h of headers) {
    const norm = h.toLowerCase().replace(/\s+/g, "");
    const match = TARGET_FIELDS.find(
      (t) =>
        t.value &&
        (norm === t.value.toLowerCase() ||
          norm === t.label.toLowerCase().replace(/\s+/g, ""))
    );
    out[h] = (match?.value as TargetField) ?? "";
  }
  return out;
}

function splitCsvRow(line: string, separator: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === separator) {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

export function ImportProjectsWizard() {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [step, setStep] = React.useState<0 | 1 | 2>(0);
  const [file, setFile] = React.useState<File | null>(null);
  const [csvText, setCsvText] = React.useState("");
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [allRows, setAllRows] = React.useState<string[][]>([]);
  const [mapping, setMapping] = React.useState<Record<string, TargetField>>({});
  const [dupHandling, setDupHandling] = React.useState<"skip" | "overwrite">("skip");
  const [encoding, setEncoding] = React.useState("utf-8");
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // ── File parsing ──────────────────────────────────────────────────────

  async function parseFile(f: File) {
    if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast.error(`File too large (max ${MAX_FILE_SIZE_MB} MB)`);
      return;
    }
    const name = f.name.toLowerCase();
    if (name.endsWith(".xls")) {
      toast.error(
        "XLS files aren't supported yet. Save your spreadsheet as CSV and re-upload."
      );
      return;
    }
    const text = await f.text();
    const separator = name.endsWith(".tsv") ? "\t" : ",";

    const lines = text.replace(/^﻿/, "").trim().split(/\r?\n/);
    if (lines.length < 2) {
      toast.error("The file must have a header row and at least one data row.");
      return;
    }
    const headersParsed = splitCsvRow(lines[0], separator).map((h) => h.trim());
    const rows = lines.slice(1).map((line) => splitCsvRow(line, separator));

    setFile(f);
    setCsvText(text);
    setHeaders(headersParsed);
    setAllRows(rows);
    setMapping(autoMap(headersParsed));
  }

  function downloadSample(format: "csv" | "xls") {
    const blob = new Blob([SAMPLE_PROJECTS_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `quikfinance-projects-sample.${format === "xls" ? "csv" : "csv"}`;
    a.click();
    URL.revokeObjectURL(url);
    if (format === "xls") {
      toast.message("Downloaded as CSV", {
        description: "XLS template ships in a future release. CSV opens in Excel.",
      });
    }
  }

  // ── Mapping validation ────────────────────────────────────────────────

  const requiredTargets = TARGET_FIELDS.filter((t) => t.required).map((t) => t.value);
  const mappedTargets = new Set(Object.values(mapping).filter(Boolean));
  const missingRequired = requiredTargets.filter((t) => !mappedTargets.has(t));
  const allRequiredMapped = missingRequired.length === 0;

  // ── Navigation ────────────────────────────────────────────────────────

  function next() {
    if (step === 0 && !file) {
      toast.error("Pick a file first.");
      return;
    }
    if (step === 1 && !allRequiredMapped) {
      toast.error(`Map all required fields: ${missingRequired.join(", ")}`);
      return;
    }
    setStep((s) => (s < 2 ? ((s + 1) as 0 | 1 | 2) : s));
  }

  function back() {
    setStep((s) => (s > 0 ? ((s - 1) as 0 | 1 | 2) : s));
  }

  async function commitImport() {
    if (!csvText) {
      toast.error("No file loaded.");
      return;
    }
    // Rebuild CSV with our canonical headers based on the user's mapping
    // so the server action's column lookups don't depend on the user's
    // exact header text.
    const remapped = remapCsv();
    setBusy(true);
    try {
      const result = await importProjectsAction({
        csvText: remapped,
        dupHandling,
      });
      if (result.errors.length > 0) {
        toast.warning(
          `${result.errors.length} rows failed — see preview for details.`,
          {
            description: `Created ${result.created}, updated ${result.updated}, skipped ${result.skipped}`,
          }
        );
      } else {
        toast.success(
          `Imported ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`
        );
      }
      router.push("/time/projects");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Build a CSV that uses canonical Quikfinance header labels (matching
   * what the server action expects). For each original CSV row, we read
   * cells by the user's mapping and write them under the canonical label.
   */
  function remapCsv(): string {
    const fieldToLabel: Record<TargetField, string> = {
      name: "Project Name",
      projectCode: "Project Code",
      customerName: "Customer Name",
      billingMethod: "Billing Method",
      description: "Description",
      costBudget: "Cost Budget",
      revenueBudget: "Revenue Budget",
      "": "",
    };

    // Determine output columns from the mapping (only mapped, non-skip).
    const outputCols: Array<{ field: TargetField; label: string; sourceHeader: string }> = [];
    for (const h of headers) {
      const field = mapping[h];
      if (!field) continue;
      outputCols.push({ field, label: fieldToLabel[field], sourceHeader: h });
    }

    const lines: string[] = [];
    lines.push(outputCols.map((c) => csvEscape(c.label)).join(","));

    const headerIdx = new Map(headers.map((h, i) => [h, i]));
    for (const row of allRows) {
      const cells = outputCols.map((c) => {
        const idx = headerIdx.get(c.sourceHeader) ?? -1;
        return csvEscape(idx >= 0 ? (row[idx] ?? "") : "");
      });
      lines.push(cells.join(","));
    }
    return lines.join("\r\n");
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-background border-b">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div /> {/* spacer */}
          <h1 className="text-lg font-semibold">Projects - Select File</h1>
          <Link
            href="/time/projects"
            aria-label="Close"
            className="rounded-md p-1.5 hover:bg-muted text-destructive"
          >
            <X className="h-5 w-5" />
          </Link>
        </div>

        {/* Step indicator */}
        <div className="max-w-5xl mx-auto px-6 pb-4">
          <ol className="flex items-center justify-center gap-6">
            {STEPS.map((s, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <li
                  key={s}
                  className={`flex items-center gap-2 ${
                    active
                      ? "text-foreground font-semibold"
                      : done
                        ? "text-muted-foreground"
                        : "text-muted-foreground/60"
                  }`}
                >
                  <span
                    className={`h-6 w-6 rounded-full flex items-center justify-center text-xs ${
                      active
                        ? "bg-blue-600 text-white"
                        : done
                          ? "bg-muted text-muted-foreground"
                          : "border border-muted-foreground/40"
                    }`}
                  >
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className="text-sm">{s}</span>
                  {i < STEPS.length - 1 ? (
                    <span className="ml-4 w-12 border-t border-muted-foreground/30" />
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-6 py-8 pb-32">
        {step === 0 && (
          <StepConfigure
            file={file}
            dragging={dragging}
            setDragging={setDragging}
            onFile={parseFile}
            fileInputRef={fileInputRef}
            downloadSample={downloadSample}
            dupHandling={dupHandling}
            setDupHandling={setDupHandling}
            encoding={encoding}
            setEncoding={setEncoding}
          />
        )}
        {step === 1 && (
          <StepMapFields
            headers={headers}
            mapping={mapping}
            setMapping={setMapping}
            missingRequired={missingRequired}
            rowCount={allRows.length}
          />
        )}
        {step === 2 && (
          <StepPreview
            headers={headers}
            mapping={mapping}
            allRows={allRows}
            dupHandling={dupHandling}
          />
        )}
      </div>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 z-10 bg-background border-t">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div>
            {step > 0 && (
              <Button onClick={back} variant="outline" disabled={busy}>
                Previous
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step < 2 && (
              <Button
                onClick={next}
                disabled={
                  busy ||
                  (step === 0 && !file) ||
                  (step === 1 && !allRequiredMapped)
                }
                className="bg-blue-600 hover:bg-blue-700 gap-1"
              >
                Next
                <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
              </Button>
            )}
            {step === 2 && (
              <Button
                onClick={commitImport}
                disabled={busy}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {busy ? "Importing…" : "Import"}
              </Button>
            )}
            <Button asChild variant="outline" disabled={busy}>
              <Link href="/time/projects">Cancel</Link>
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step components
// ─────────────────────────────────────────────────────────────────────────

function StepConfigure({
  file,
  dragging,
  setDragging,
  onFile,
  fileInputRef,
  downloadSample,
  dupHandling,
  setDupHandling,
  encoding,
  setEncoding,
}: {
  file: File | null;
  dragging: boolean;
  setDragging: (b: boolean) => void;
  onFile: (f: File) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  downloadSample: (format: "csv" | "xls") => void;
  dupHandling: "skip" | "overwrite";
  setDupHandling: (v: "skip" | "overwrite") => void;
  encoding: string;
  setEncoding: (v: string) => void;
}) {
  return (
    <div className="space-y-8">
      {/* Drag-and-drop card */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
        className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
          dragging
            ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/20"
            : "border-muted-foreground/30 bg-muted/20"
        }`}
      >
        <div className="h-14 w-14 rounded-full bg-background border mx-auto flex items-center justify-center shadow-sm">
          <Download className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="mt-3 font-medium text-sm">
          {file ? file.name : "Drag and drop file to import"}
        </p>

        {/* Choose File + split caret */}
        <div className="mt-4 inline-flex shadow-sm rounded-md">
          <Button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-r-none bg-blue-600 hover:bg-blue-700"
          >
            Choose File
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="rounded-l-none border-l border-blue-700/40 px-2 bg-blue-600 hover:bg-blue-700"
                aria-label="More upload options"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem disabled>
                Upload from URL
                <span className="ml-2 text-[10px] uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded-sm">
                  Soon
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem disabled>
                Import from Google Drive
                <span className="ml-2 text-[10px] uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded-sm">
                  Soon
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />

        <p className="mt-4 text-xs text-muted-foreground">
          Maximum File Size: {MAX_FILE_SIZE_MB} MB &nbsp;•&nbsp; File Format: CSV
          or TSV or XLS
        </p>
      </div>

      {/* Sample download links */}
      <p className="text-sm text-muted-foreground">
        Download a{" "}
        <button
          type="button"
          onClick={() => downloadSample("csv")}
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          sample csv file
        </button>{" "}
        or{" "}
        <button
          type="button"
          onClick={() => downloadSample("xls")}
          className="text-blue-600 hover:text-blue-700 font-medium"
        >
          sample xls file
        </button>{" "}
        and compare it to your import file to ensure you have the file perfect
        for the import.
      </p>

      {/* Duplicate Handling */}
      <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
        <div className="text-sm font-medium pt-1">
          <span className="text-destructive">Duplicate Handling:</span>
          <span className="text-destructive ml-0.5">*</span>
          <span
            title="How to handle Project Name conflicts between the file and the database."
            className="text-muted-foreground inline-block ml-1 align-middle"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className="space-y-3">
          <DupRadio
            checked={dupHandling === "skip"}
            onChange={() => setDupHandling("skip")}
            label="Skip Duplicates"
            description="Retains the existing projects and does not import duplicate rows from the file."
          />
          <DupRadio
            checked={dupHandling === "overwrite"}
            onChange={() => setDupHandling("overwrite")}
            label="Overwrite"
            description="Imports the rows from the file and overwrites matching projects in Quikfinance."
          />
        </div>
      </div>

      {/* Character Encoding */}
      <div className="grid grid-cols-[180px_1fr] gap-4 items-start">
        <div className="text-sm font-medium pt-1.5">
          Character Encoding
          <span
            title="Text encoding used to read your file. UTF-8 covers most cases."
            className="text-muted-foreground inline-block ml-1 align-middle"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </span>
        </div>
        <select
          value={encoding}
          onChange={(e) => setEncoding(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="utf-8">UTF-8 (Unicode)</option>
          <option value="ascii">ASCII</option>
          <option value="iso-8859-1">ISO-8859-1 (Latin-1)</option>
          <option value="windows-1252">Windows-1252</option>
        </select>
      </div>

      {/* Page Tips */}
      <div className="rounded-md border bg-amber-50/40 dark:bg-amber-950/10 p-4">
        <div className="text-sm font-semibold mb-2">💡 Page Tips</div>
        <ul className="list-disc pl-5 space-y-1.5 text-xs text-muted-foreground">
          <li>
            Customer Name must exactly match an existing customer&apos;s display
            name (case-insensitive). Create the customer first if it
            doesn&apos;t exist.
          </li>
          <li>
            Billing Method accepts either the value (<code>fixed_cost</code> /{" "}
            <code>project_hours</code> / <code>task_hours</code> /{" "}
            <code>staff_hours</code>) or the friendly label.
          </li>
          <li>
            Cost Budget and Revenue Budget are optional numeric columns. Commas
            are stripped before parsing.
          </li>
          <li>
            Skip Duplicates keeps existing projects untouched; Overwrite updates
            them in place by Project Name.
          </li>
        </ul>
      </div>
    </div>
  );
}

function StepMapFields({
  headers,
  mapping,
  setMapping,
  missingRequired,
  rowCount,
}: {
  headers: string[];
  mapping: Record<string, TargetField>;
  setMapping: (m: Record<string, TargetField>) => void;
  missingRequired: string[];
  rowCount: number;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Map fields</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Match each column from your file to a Quikfinance field. We auto-mapped
          columns whose names matched. Pick &ldquo;Skip&rdquo; for columns you
          don&apos;t want to import.
        </p>
      </div>

      {missingRequired.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Required fields not mapped:</strong>{" "}
            {missingRequired
              .map((f) => TARGET_FIELDS.find((t) => t.value === f)?.label)
              .filter(Boolean)
              .join(", ")}
            <p className="text-xs text-muted-foreground mt-0.5">
              Map them below before continuing.
            </p>
          </div>
        </div>
      )}

      <table className="w-full border text-sm">
        <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="text-left p-3">CSV Column</th>
            <th className="text-left p-3">Maps to Quikfinance Field</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {headers.map((h) => {
            const current = mapping[h] ?? "";
            const field = TARGET_FIELDS.find((t) => t.value === current);
            const isRequired = field?.required;
            return (
              <tr key={h}>
                <td className="p-3 font-medium">{h}</td>
                <td className="p-3">
                  <select
                    value={current}
                    onChange={(e) =>
                      setMapping({ ...mapping, [h]: e.target.value as TargetField })
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {TARGET_FIELDS.map((t) => (
                      <option key={t.value || "skip"} value={t.value}>
                        {t.label}
                        {t.required ? " *" : ""}
                      </option>
                    ))}
                  </select>
                  {isRequired && (
                    <span className="text-[11px] text-emerald-600 inline-flex items-center gap-1 mt-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Required — mapped
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="text-xs text-muted-foreground">
        {rowCount} data row{rowCount === 1 ? "" : "s"} detected.
      </p>
    </div>
  );
}

function StepPreview({
  headers,
  mapping,
  allRows,
  dupHandling,
}: {
  headers: string[];
  mapping: Record<string, TargetField>;
  allRows: string[][];
  dupHandling: "skip" | "overwrite";
}) {
  // Show only mapped, non-skip columns
  const cols = headers
    .map((h, i) => ({ h, i, field: mapping[h] }))
    .filter((c) => c.field);
  const previewRows = allRows.slice(0, 10);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Preview</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Showing the first {previewRows.length} of {allRows.length} data row
          {allRows.length === 1 ? "" : "s"}. Click <strong>Import</strong> to
          commit ({dupHandling === "skip" ? "Skip Duplicates" : "Overwrite"}).
        </p>
      </div>

      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-2 w-12">#</th>
              {cols.map((c) => (
                <th key={c.h} className="text-left p-2 whitespace-nowrap">
                  {TARGET_FIELDS.find((t) => t.value === c.field)?.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {previewRows.map((row, idx) => (
              <tr key={idx}>
                <td className="p-2 text-muted-foreground">{idx + 1}</td>
                {cols.map((c) => (
                  <td key={c.h} className="p-2 whitespace-nowrap max-w-xs truncate">
                    {row[c.i] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function DupRadio({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 mt-0.5 border-input text-blue-600 focus:ring-blue-500"
      />
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
    </label>
  );
}

function csvEscape(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) return "";
  const s = String(cell);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
