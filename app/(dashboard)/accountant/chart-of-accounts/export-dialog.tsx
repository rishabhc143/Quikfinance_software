"use client";

import * as React from "react";
import { Info, X, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";

/**
 * ACCT-E.4 — Export Chart of Accounts modal, matching Zoho's UX.
 *
 * Fields:
 *   - Module *           (read-only — only "Chart of Accounts")
 *   - Export Template    (optional; no templates in v1)
 *   - Decimal Format *   (1234567.89 / 1,234,567.89 / 1.234.567,89)
 *   - Export File Format * (CSV / XLS / XLSX — XLS+XLSX disabled in v1)
 *   - File Protection Password (UI-only, validation note shown)
 *
 * Submit builds a `/chart-of-accounts/export?…` URL with the chosen
 * options as query params and triggers a normal browser download.
 */
export function ExportCoaDialog({
  open,
  onOpenChange,
  scopeQuery,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-built `?status=…&q=…` from the list page so the export
   *  matches what the user is currently viewing. */
  scopeQuery: string;
}) {
  const [decimalFormat, setDecimalFormat] = React.useState<
    "1234567.89" | "1,234,567.89" | "1.234.567,89"
  >("1234567.89");
  const [fileFormat, setFileFormat] = React.useState<"csv" | "xls" | "xlsx">(
    "csv"
  );
  const [password, setPassword] = React.useState("");
  const [showPwd, setShowPwd] = React.useState(false);

  function buildHref(): string {
    const qs = new URLSearchParams();
    // Preserve the list-page filters that came through.
    if (scopeQuery) {
      for (const [k, v] of new URLSearchParams(
        scopeQuery.replace(/^\?/, "")
      )) {
        qs.set(k, v);
      }
    }
    qs.set("format", fileFormat);
    qs.set("decimal", decimalFormat);
    if (password) qs.set("password", password);
    return `/accountant/chart-of-accounts/export?${qs.toString()}`;
  }

  function submit() {
    // Direct navigation triggers the file download.
    window.location.href = buildHref();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="text-base font-semibold">
            Export Chart of Accounts
          </DialogTitle>
          <DialogClose className="absolute right-4 top-4 text-destructive hover:opacity-80">
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogClose>
        </DialogHeader>

        <div className="p-6 space-y-4">
          <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 p-3 flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <p className="text-xs text-blue-900 dark:text-blue-200">
              You can export your data from Quikfinance in CSV, XLS or XLSX
              format.
            </p>
          </div>

          <div>
            <Label className="text-destructive">
              Module<span aria-hidden>*</span>
            </Label>
            <select
              value="ChartOfAccounts"
              disabled
              className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 text-sm"
            >
              <option value="ChartOfAccounts">Chart of Accounts</option>
            </select>
          </div>

          <div>
            <Label className="inline-flex items-center gap-1">
              Export Template
              <Info className="h-3 w-3 text-muted-foreground" />
            </Label>
            <select
              defaultValue=""
              disabled
              className="flex h-10 w-full rounded-md border border-input bg-muted/40 px-3 text-sm"
            >
              <option value="">Select an Export Template</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Custom export templates land in a future release.
            </p>
          </div>

          <div className="border-t pt-4">
            <Label className="text-destructive">
              Decimal Format<span aria-hidden>*</span>
            </Label>
            <select
              value={decimalFormat}
              onChange={(e) =>
                setDecimalFormat(
                  e.target.value as
                    | "1234567.89"
                    | "1,234,567.89"
                    | "1.234.567,89"
                )
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="1234567.89">1234567.89</option>
              <option value="1,234,567.89">1,234,567.89</option>
              <option value="1.234.567,89">1.234.567,89</option>
            </select>
          </div>

          <div>
            <Label className="text-destructive">
              Export File Format<span aria-hidden>*</span>
            </Label>
            <div className="space-y-2 pl-1 mt-2">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="radio"
                  name="fileFormat"
                  value="csv"
                  checked={fileFormat === "csv"}
                  onChange={() => setFileFormat("csv")}
                  className="h-4 w-4"
                />
                CSV (Comma Separated Value)
              </label>
              <label className="flex items-center gap-2 cursor-not-allowed text-sm opacity-60">
                <input
                  type="radio"
                  name="fileFormat"
                  value="xls"
                  disabled
                  className="h-4 w-4"
                />
                XLS (Microsoft Excel 1997–2004 Compatible)
                <span className="text-xs text-muted-foreground ml-1">
                  (coming soon)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-not-allowed text-sm opacity-60">
                <input
                  type="radio"
                  name="fileFormat"
                  value="xlsx"
                  disabled
                  className="h-4 w-4"
                />
                XLSX (Microsoft Excel)
                <span className="text-xs text-muted-foreground ml-1">
                  (coming soon)
                </span>
              </label>
            </div>
          </div>

          <div>
            <Label>File Protection Password</Label>
            <div className="relative">
              <Input
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="(coming soon — CSV exports are unencrypted)"
                disabled
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                disabled
                aria-label={showPwd ? "Hide password" : "Show password"}
              >
                {showPwd ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Your password must be at least 12 characters and include one
              uppercase letter, lowercase letter, number, and special
              character. Encrypted exports land in a future release.
            </p>
          </div>

          <p className="text-xs text-muted-foreground border-t pt-3">
            <b>Note:</b> You can export only the first 25,000 rows.
            Quikfinance orgs rarely have more, but if yours does, kick off a
            DB backup from Settings instead.
          </p>
        </div>

        <div className="flex justify-start gap-2 p-4 border-t bg-muted/20">
          <Button type="button" onClick={submit}>
            Export
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
