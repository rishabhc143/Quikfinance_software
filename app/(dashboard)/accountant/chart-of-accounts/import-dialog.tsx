"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  parseCoaCsvAction,
  importCoaAction,
  type ImportResult,
  type DuplicateMode,
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

const MAX_BYTES = 25 * 1024 * 1024; // matches a 25 MB cap

type Step = 1 | 2 | 3;

/**
 * ACCT-E.4 — 3-step CoA import wizard mirroring the reference UX:
 *
 *   ① Configure — file picker + duplicate handling + encoding
 *   ② Map Fields — auto-mapped columns with read-only display
 *   ③ Preview — parsed rows + per-row errors; click Import
 *
 * The parser does header-name auto-match so the Map step is
 * informational for v1. A future iteration can let the user
 * remap columns explicitly if their CSV has different headers.
 */
export function ImportCoaDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);
  const [file, setFile] = React.useState<File | null>(null);
  const [dupMode, setDupMode] = React.useState<DuplicateMode>("skip");
  const [encoding, setEncoding] = React.useState<string>("UTF-8");
  const [parseResult, setParseResult] = React.useState<ParseResult | null>(
    null
  );
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  function reset() {
    setStep(1);
    setFile(null);
    setParseResult(null);
    setDupMode("skip");
    setEncoding("UTF-8");
    if (inputRef.current) inputRef.current.value = "";
  }

  React.useEffect(() => {
    if (!open) reset();
  }, [open]);

  function pickFile(f: File) {
    if (f.size > MAX_BYTES) {
      toast.error("File too large (max 25 MB)");
      return;
    }
    setFile(f);
  }

  async function goToMap() {
    if (!file) {
      toast.error("Pick a file first");
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const res = await parseCoaCsvAction(text);
      setParseResult(res);
      setStep(2);
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
      const res: ImportResult = await importCoaAction(
        parseResult.rows,
        dupMode
      );
      const total = res.created + res.updated;
      if (total > 0) {
        const pieces: string[] = [];
        if (res.created > 0)
          pieces.push(
            `${res.created} new account${res.created === 1 ? "" : "s"}`
          );
        if (res.updated > 0)
          pieces.push(
            `${res.updated} updated`
          );
        if (res.skipped > 0)
          pieces.push(`${res.skipped} skipped`);
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
      <DialogContent className="max-w-4xl p-0 gap-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="text-base font-semibold text-center">
            Accounts - Select File
          </DialogTitle>
          {/* Note: <DialogContent> already renders its own X close
              button (components/ui/dialog.tsx). Don't add another
              one here — that was the dup-close bug. */}
        </DialogHeader>

        {/* ── Stepper ─────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-6 py-4 border-b text-sm">
          <Stepper n={1} label="Configure" active={step === 1} done={step > 1} />
          <div className="h-px w-12 bg-border" />
          <Stepper n={2} label="Map Fields" active={step === 2} done={step > 2} />
          <div className="h-px w-12 bg-border" />
          <Stepper n={3} label="Preview" active={step === 3} done={false} />
        </div>

        {/* ── Step content ────────────────────────────────── */}
        {step === 1 && (
          <Step1Configure
            file={file}
            inputRef={inputRef}
            onPickFile={pickFile}
            dupMode={dupMode}
            setDupMode={setDupMode}
            encoding={encoding}
            setEncoding={setEncoding}
            busy={busy}
          />
        )}
        {step === 2 && parseResult && (
          <Step2Map result={parseResult} />
        )}
        {step === 3 && parseResult && (
          <Step3Preview result={parseResult} />
        )}

        {/* ── Footer buttons ──────────────────────────────── */}
        <div className="flex justify-between gap-2 p-4 border-t bg-muted/20">
          <div>
            {step === 1 ? (
              <Button
                type="button"
                onClick={goToMap}
                disabled={busy || !file}
              >
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Next ›
              </Button>
            ) : step === 2 ? (
              <Button
                type="button"
                onClick={() => setStep(3)}
                disabled={
                  busy || !parseResult || parseResult.rows.length === 0
                }
              >
                Next ›
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleImport}
                disabled={busy || (parseResult?.rows.length ?? 0) === 0}
              >
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Import {parseResult?.rows.length ?? 0}{" "}
                row{(parseResult?.rows.length ?? 0) === 1 ? "" : "s"}
              </Button>
            )}
            {step > 1 && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep((s) => (s - 1) as Step)}
                disabled={busy}
                className="ml-2"
              >
                ‹ Previous
              </Button>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Stepper bubble ────────────────────────────────────────────

function Stepper({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={
          "h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold " +
          (active
            ? "bg-primary text-primary-foreground"
            : done
              ? "bg-emerald-600 text-white"
              : "bg-muted text-muted-foreground")
        }
      >
        {done ? <Check className="h-3.5 w-3.5" /> : n}
      </div>
      <span
        className={
          (active ? "font-semibold" : "text-muted-foreground") + " text-sm"
        }
      >
        {label}
      </span>
    </div>
  );
}

// ─── Step 1: Configure ────────────────────────────────────────

function Step1Configure({
  file,
  inputRef,
  onPickFile,
  dupMode,
  setDupMode,
  encoding,
  setEncoding,
  busy,
}: {
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onPickFile: (f: File) => void;
  dupMode: DuplicateMode;
  setDupMode: (m: DuplicateMode) => void;
  encoding: string;
  setEncoding: (s: string) => void;
  busy: boolean;
}) {
  return (
    <div className="p-8 space-y-6 max-w-3xl mx-auto">
      {/* Drop zone */}
      <label
        className={
          "block border-2 border-dashed rounded-lg p-12 text-center cursor-pointer hover:bg-muted/30 transition-colors " +
          (busy ? "opacity-60 pointer-events-none" : "")
        }
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.xls,text/csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPickFile(f);
          }}
        />
        <div className="space-y-2">
          {file ? (
            <FileText className="h-10 w-10 mx-auto text-primary" />
          ) : (
            <Upload className="h-10 w-10 mx-auto text-muted-foreground" />
          )}
          <div className="text-sm font-medium">
            {file ? file.name : "Drag and drop file to import"}
          </div>
          {!file && (
            <Button type="button" variant="default" size="sm">
              Choose File
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            Maximum File Size: 25 MB · File Format: CSV or TSV or XLS
          </p>
        </div>
      </label>

      <p className="text-sm text-muted-foreground text-center">
        Download a{" "}
        <a
          href="/accountant/chart-of-accounts/export?status=all"
          className="text-primary hover:underline"
        >
          sample file
        </a>{" "}
        and compare it to your import file to ensure you have the file
        perfect for the import.
      </p>

      {/* Duplicate handling */}
      <div className="space-y-2 border-t pt-4">
        <Label className="text-destructive">
          Duplicate Handling: <span aria-hidden>*</span>
        </Label>
        <div className="space-y-3 pl-1">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="dupMode"
              value="skip"
              checked={dupMode === "skip"}
              onChange={() => setDupMode("skip")}
              className="h-4 w-4 mt-0.5"
            />
            <div>
              <div className="text-sm font-medium">Skip Duplicates</div>
              <div className="text-xs text-muted-foreground">
                Retains the accounts already in your Chart of Accounts and
                does not import the duplicates in the import file.
              </div>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="dupMode"
              value="overwrite"
              checked={dupMode === "overwrite"}
              onChange={() => setDupMode("overwrite")}
              className="h-4 w-4 mt-0.5"
            />
            <div>
              <div className="text-sm font-medium">Overwrite accounts</div>
              <div className="text-xs text-muted-foreground">
                Imports the duplicates in the import file and overwrites the
                existing accounts (system accounts are still protected).
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Character encoding */}
      <div className="grid gap-2 md:grid-cols-[200px_1fr] items-center">
        <Label>Character Encoding</Label>
        <select
          value={encoding}
          onChange={(e) => setEncoding(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="UTF-8">UTF-8 (Unicode)</option>
          <option value="UTF-16">UTF-16</option>
          <option value="windows-1252">Windows-1252</option>
        </select>
      </div>

      <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
        💡 <b>Page Tips:</b> Use the export of an existing org as a template.
        Required columns are <code>Account Name</code> and{" "}
        <code>Account Type</code>; everything else is optional.
      </div>
    </div>
  );
}

// ─── Step 2: Map Fields (auto-mapped, read-only for v1) ────────

function Step2Map({ result }: { result: ParseResult }) {
  // The parser does header-name auto-match. For v1 the Map step
  // just SHOWS the inferred mapping so the user sees what landed
  // where. A future iteration can let them remap.
  const FIELDS: Array<{ csvHeader: string; quikField: string }> = [
    { csvHeader: "Account Code", quikField: "code" },
    { csvHeader: "Account Name", quikField: "name (required)" },
    { csvHeader: "Account Type", quikField: "type (required)" },
    { csvHeader: "Sub-type", quikField: "subType" },
    { csvHeader: "Parent Account", quikField: "(deferred — v2)" },
    { csvHeader: "Status", quikField: "isActive" },
    { csvHeader: "System", quikField: "(read-only flag, ignored)" },
    { csvHeader: "Description", quikField: "description" },
  ];

  return (
    <div className="p-6 space-y-4 max-w-3xl mx-auto">
      <p className="text-sm text-muted-foreground">
        Columns are mapped automatically from header names. Below is the
        mapping that will be used for the {result.rows.length}{" "}
        valid row{result.rows.length === 1 ? "" : "s"} +{" "}
        {result.errors.length} error{result.errors.length === 1 ? "" : "s"}
        .
      </p>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left p-3">CSV column</th>
              <th className="text-left p-3">Quikfinance field</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {FIELDS.map((f) => (
              <tr key={f.csvHeader}>
                <td className="p-3 font-mono text-xs">{f.csvHeader}</td>
                <td className="p-3 text-xs text-muted-foreground">
                  {f.quikField}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Step 3: Preview ──────────────────────────────────────────

function Step3Preview({ result }: { result: ParseResult }) {
  return (
    <div className="p-6 space-y-4 max-w-3xl mx-auto">
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Rows scanned" value={String(result.totalRows)} />
        <Stat
          label="Valid rows"
          value={String(result.rows.length)}
          tone="success"
        />
        <Stat
          label="Row errors"
          value={String(result.errors.length)}
          tone={result.errors.length > 0 ? "danger" : "muted"}
        />
      </div>

      {result.errors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5">
          <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-destructive border-b border-destructive/30">
            <AlertCircle className="h-4 w-4" />
            Errors ({result.errors.length})
          </div>
          <div className="max-h-40 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left p-2 w-16">Row</th>
                  <th className="text-left p-2 w-32">Field</th>
                  <th className="text-left p-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {result.errors.map((e, i) => (
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

      {result.rows.length > 0 && (
        <div className="rounded-md border">
          <div className="flex items-center gap-2 px-3 py-2 text-sm font-medium border-b">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Valid rows ({result.rows.length})
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
                {result.rows.slice(0, 100).map((r, i) => (
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
            {result.rows.length > 100 && (
              <div className="p-2 text-xs text-muted-foreground text-center bg-muted/20">
                +{result.rows.length - 100} more (full list will import)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-destructive"
        : "";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"font-semibold " + toneClass}>{value}</div>
    </div>
  );
}

