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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  importRecurringBillsAction,
  type RBDupHandling,
  type RBImportResult,
} from "./actions";

const STEPS = ["Upload", "Preview", "Done"] as const;

const SAMPLE_RB_CSV = `profile_name,vendor_name,frequency,interval_n,start_date,end_date,never_expires,currency,place_of_supply,line_name,line_description,line_quantity,line_rate,line_account,line_tax_name,line_billable_customer
Office rent — HQ,Acme Suppliers,monthly,1,2026-04-01,,true,INR,Maharashtra,Office rent,Building A retail floor,1,50000,Rent,GST 18%,
Cloud hosting,Looney Logistics,monthly,1,2026-04-01,2027-04-01,false,INR,,AWS retainer,Production cluster,1,4500,Hosting,GST 18%,Acme Inc
`;

/**
 * Recurring Bills Import wizard — 3-step CSV upload flow.
 *
 * Each CSV row creates one Recurring Bill profile with one primary
 * line. Multi-line profiles can be assembled on the detail page
 * post-import. Profiles default to ACTIVE — the cron picks them up
 * on the next tick.
 */
export function ImportRecurringBillsWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [csvText, setCsvText] = React.useState("");
  const [dupHandling, setDupHandling] = React.useState<RBDupHandling>("skip");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<RBImportResult | null>(null);

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
    const blob = new Blob([SAMPLE_RB_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quikfinance-recurring-bills-sample.csv";
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
      const r = await importRecurringBillsAction({ csvText, dupHandling });
      setResult(r);
      setStep(2);
      if (r.errors.length === 0) {
        toast.success(
          `Imported: ${r.created} created, ${r.updated} updated, ${r.skipped} skipped`
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
                  <Label htmlFor="file">Upload CSV</Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Max 5 MB.{" "}
                    <button
                      type="button"
                      className="underline"
                      onClick={downloadSample}
                    >
                      Download sample CSV
                    </button>
                  </p>
                </div>
                <div className="space-y-1">
                  <Label>If a profile with the same name exists</Label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {(
                      ["skip", "overwrite", "add_as_new"] as RBDupHandling[]
                    ).map((opt) => (
                      <label
                        key={opt}
                        className={`rounded-md border px-2 py-2 text-center cursor-pointer ${
                          dupHandling === opt
                            ? "border-primary bg-primary/5"
                            : ""
                        }`}
                      >
                        <input
                          type="radio"
                          className="sr-only"
                          checked={dupHandling === opt}
                          onChange={() => setDupHandling(opt)}
                        />
                        {opt === "skip"
                          ? "Skip"
                          : opt === "overwrite"
                          ? "Overwrite"
                          : "Add as new"}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <p className="rounded-md border-l-4 border-blue-400 bg-blue-50 dark:bg-blue-950/30 p-3 text-xs">
                Each CSV row creates one Recurring Bill profile with one
                primary line. Frequencies:{" "}
                <code>weekly</code> / <code>monthly</code> /{" "}
                <code>quarterly</code> / <code>yearly</code>. Set{" "}
                <code>never_expires=true</code> or supply <code>end_date</code>{" "}
                — not both. Profiles default to <strong>ACTIVE</strong> and the
                cron starts generating bills on the start date.
              </p>
              <div className="flex justify-end">
                <Button
                  onClick={() => setStep(1)}
                  disabled={!csvText}
                  className="gap-1"
                >
                  <Upload className="h-4 w-4" /> Continue to preview
                </Button>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                Preview of the first {previewRows.length} row
                {previewRows.length === 1 ? "" : "s"}:
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      {Object.keys(previewRows[0] ?? {}).map((h) => (
                        <th key={h} className="p-2 text-left">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previewRows.map((r, i) => (
                      <tr key={i}>
                        {Object.values(r).map((c, j) => (
                          <td key={j} className="p-2 align-top">
                            {c}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {previewRows.length === 0 ? (
                      <tr>
                        <td className="p-3 text-center text-muted-foreground">
                          No rows to preview.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button
                  onClick={runImport}
                  disabled={busy || !csvText}
                  className="gap-1"
                >
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Import profiles
                </Button>
              </div>
            </div>
          ) : null}

          {step === 2 && result ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-base font-medium">
                {result.errors.length === 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-600" />
                )}
                Import {result.errors.length === 0 ? "complete" : "finished with warnings"}
              </div>
              <div className="grid gap-3 sm:grid-cols-4 text-center">
                <Stat label="Parsed" value={result.parsed} />
                <Stat label="Created" value={result.created} />
                <Stat label="Updated" value={result.updated} />
                <Stat label="Skipped" value={result.skipped} />
              </div>
              {result.errors.length > 0 ? (
                <div className="rounded-md border">
                  <div className="p-3 border-b bg-muted/40 text-sm font-medium">
                    {result.errors.length} row error
                    {result.errors.length === 1 ? "" : "s"}
                  </div>
                  <ul className="text-xs divide-y">
                    {result.errors.slice(0, 50).map((e, i) => (
                      <li key={i} className="p-2">
                        <span className="font-mono text-muted-foreground">
                          row {e.row}
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
              <div className="flex justify-between">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setStep(0);
                    setResult(null);
                    setCsvText("");
                  }}
                >
                  Import another file
                </Button>
                <Button
                  onClick={() => router.push("/purchases/recurring-bills")}
                >
                  Go to Recurring Bills
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
