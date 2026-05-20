"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
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
 * ExportCurrentViewDialog — simpler sibling of ExportTimesheetsDialog.
 *
 * - No Module / Template / PII fields
 * - 10,000 row cap instead of 25,000
 * - Forwards period / scope / customerId / projectId / userId filters
 *   from the list page so the file matches what's on screen
 */
export function ExportCurrentViewDialog({
  trigger,
}: {
  trigger: React.ReactNode;
}) {
  const sp = useSearchParams();
  const [open, setOpen] = React.useState(false);

  const [format, setFormat] = React.useState<"csv" | "xls" | "xlsx" | "pdf">(
    "csv"
  );
  const [decimal, setDecimal] = React.useState<"us" | "eu">("us");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  function onExport() {
    setBusy(true);
    try {
      const params = new URLSearchParams();
      params.set("format", format);
      params.set("decimal", decimal);
      params.set("includePii", "false");
      params.set("maxRows", "10000");

      // Forward all 5 list-page filters.
      for (const key of ["scope", "period", "customerId", "projectId", "userId"]) {
        const v = sp.get(key);
        if (v) params.set(key, v);
      }

      const url = `/time/entries/export?${params.toString()}`;
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
        <div className="px-6 py-4 border-b shrink-0">
          <h2 className="text-base font-semibold">Export Current View</h2>
        </div>

        <div className="px-6 py-4 space-y-5 overflow-y-auto">
          <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-3 py-2 text-xs flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-blue-600 shrink-0 mt-0.5" />
            <span>
              Only the current view with its visible columns will be exported
              from Quikfinance in CSV or XLS format.
            </span>
          </div>

          <div>
            <Label className="text-destructive mb-1.5 block">
              Decimal Format*
            </Label>
            <select
              value={decimal}
              onChange={(e) => setDecimal(e.target.value as "us" | "eu")}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="us">1234567.89</option>
              <option value="eu">1234567,89</option>
            </select>
          </div>

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
                label="PDF (Branded report)"
              />
            </div>
          </div>

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

          <div className="text-xs text-muted-foreground border-t pt-3">
            <span className="font-semibold">Note: </span>You can export only
            the first 10,000 entries. If you have more, please contact support
            to initiate a full backup.
          </div>
        </div>

        <div className="px-6 py-4 border-t flex items-center gap-2 shrink-0">
          <Button
            onClick={onExport}
            disabled={busy}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {busy ? "Exporting…" : "Export"}
          </Button>
          <Button
            onClick={() => setOpen(false)}
            variant="outline"
            disabled={busy}
          >
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
