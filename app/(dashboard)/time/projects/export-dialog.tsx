"use client";

import * as React from "react";
import { Info, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/**
 * ExportProjectsDialog — the full-featured Export Projects modal.
 *
 * Drops any active filters (always exports the whole org). For the
 * filter-aware variant see `ExportCurrentViewDialog`.
 *
 * `trigger` is the menu item that opens this dialog — we pass it
 * through so the DropdownMenuItem stays as the trigger element.
 */
export function ExportProjectsDialog({
  trigger,
}: {
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);

  const [format, setFormat] = React.useState<"csv" | "xls" | "xlsx" | "pdf">("csv");
  const [decimal, setDecimal] = React.useState<"us" | "eu">("us");
  const [includePii, setIncludePii] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  function onExport() {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      params.set("format", format);
      params.set("decimal", decimal);
      params.set("includePii", includePii ? "true" : "false");

      // Trigger file download via temporary anchor.
      const url = `/time/projects/export?${params.toString()}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      toast.success(`Export started (${format.toUpperCase()})`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-md p-0 gap-0 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header — DialogContent renders its own X at top-right; do not add another. */}
        <div className="px-6 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold">Export Projects</h2>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-5 overflow-y-auto">
          {/* Info banner */}
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-3 py-2 text-xs flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
            <span>You can export your data from Quikfinance in CSV, XLS or XLSX format.</span>
          </div>

          {/* Module — interactive but Projects is the only module wired for export today */}
          <div>
            <Label className="text-destructive mb-1.5 block">Module*</Label>
            <select
              value="projects"
              onChange={() => {
                // No-op for v1 — other modules will land when their export routes ship.
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="projects">Projects</option>
            </select>
          </div>

          {/* Export Template */}
          <div>
            <Label className="mb-1.5 flex items-center gap-1">
              Export Template
              <span
                title="Pre-saved export configurations. Custom templates land in a future release."
                className="text-muted-foreground"
              >
                <Info className="h-3 w-3" />
              </span>
            </Label>
            <select
              defaultValue="default"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="default">Default</option>
            </select>
          </div>

          {/* Decimal Format */}
          <div>
            <Label className="text-destructive mb-1.5 block">Decimal Format*</Label>
            <select
              value={decimal}
              onChange={(e) => setDecimal(e.target.value as "us" | "eu")}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="us">1234567.89</option>
              <option value="eu">1234567,89</option>
            </select>
          </div>

          {/* Export File Format */}
          <div className="space-y-2">
            <Label className="text-destructive">Export File Format*</Label>
            <div className="space-y-2">
              <FormatRadio
                checked={format === "csv"}
                onChange={() => setFormat("csv")}
                label="CSV (Comma Separated Value)"
              />
              <FormatRadio
                checked={format === "xls"}
                onChange={() => setFormat("xls")}
                label="XLS (Microsoft Excel 1997-2004 Compatible)"
              />
              <FormatRadio
                checked={format === "xlsx"}
                onChange={() => setFormat("xlsx")}
                label="XLSX (Microsoft Excel)"
              />
              <FormatRadio
                checked={format === "pdf"}
                onChange={() => setFormat("pdf")}
                label="PDF (Branded report — Quikfinance layout)"
              />
            </div>
          </div>

          {/* Include PII */}
          <label className="inline-flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includePii}
              onChange={(e) => setIncludePii(e.target.checked)}
              className="h-4 w-4 mt-0.5 rounded border-input text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm">
              Include Sensitive Personally Identifiable Information (PII) while exporting.
            </span>
          </label>

          {/* File Protection Password */}
          <div>
            <Label className="mb-1.5 block">
              File Protection Password
              <span className="ml-2 text-[10px] uppercase tracking-wider bg-muted px-1.5 py-0.5 rounded-sm align-middle">
                Soon
              </span>
            </Label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled
                className="pr-10 cursor-not-allowed"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                disabled
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-40"
                aria-label="Toggle password visibility"
              >
                {showPassword ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Your password must be at least 12 characters and include one
              uppercase letter, lowercase letter, number, and special character.
              Password-protected XLSX exports ship in a future release.
            </p>
          </div>

          {/* Note */}
          <div className="text-xs text-muted-foreground border-t pt-3">
            <span className="font-semibold">Note: </span>You can export only the
            first 25,000 rows. If you have more rows, please contact support to
            initiate a full data backup of your Quikfinance organization.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center gap-2 shrink-0">
          <Button
            onClick={onExport}
            disabled={busy}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {busy ? "Exporting…" : "Export"}
          </Button>
          <Button onClick={() => setOpen(false)} variant="outline" disabled={busy}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FormatRadio({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer w-full">
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4 border-input text-blue-600 focus:ring-blue-500"
      />
      <span className="text-sm">{label}</span>
    </label>
  );
}
