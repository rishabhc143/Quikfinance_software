"use client";

import * as React from "react";
import { Download, Eye, EyeOff } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * M27: Sales export dialog — replaces the simple "Export all" /
 * "Export current view" three-dots links per the Invoices Refinement
 * Patch spec. Builds the URL with the user's options and opens it
 * in a new tab so the browser handles the download.
 *
 * Generic over the doc type — caller passes the export route base
 * (e.g. "/api/sales/invoices/export"), the entity label
 * ("Invoices"), and the list of statuses to show in the Status
 * dropdown. PDF protection password is XLSX-only.
 */

export type SalesExportDialogProps = {
  /** Trigger element (the three-dots <Link> replacement). */
  trigger: React.ReactNode;
  /** Entity label, e.g. "Invoices". */
  entityLabel: string;
  /** Base export URL, e.g. "/api/sales/invoices/export". */
  exportHref: string;
  /** Status options shown in the dropdown. First entry should be
   *  `{ value: "all", label: "All" }`. */
  statusOptions?: { value: string; label: string }[];
  /** When true, renders the date range inputs (Invoice/Quote/SO/CN/DC).
   *  Hide for entities like Customers. Default: true. */
  showDateRange?: boolean;
};

const DECIMAL_FORMATS: { value: "us" | "en" | "eu"; label: string }[] = [
  { value: "us", label: "1234567.89 (raw)" },
  { value: "en", label: "1,234,567.89" },
  { value: "eu", label: "1.234.567,89" },
];

export function SalesExportDialog({
  trigger,
  entityLabel,
  exportHref,
  statusOptions = [{ value: "all", label: "All" }],
  showDateRange = true,
}: SalesExportDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [format, setFormat] = React.useState<"csv" | "xlsx">("csv");
  const [decimalFormat, setDecimalFormat] = React.useState<"us" | "en" | "eu">(
    "us"
  );
  const [includePii, setIncludePii] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [scope, setScope] = React.useState<"all" | "current_view">("all");

  function buildUrl() {
    const u = new URL(
      exportHref,
      typeof window !== "undefined" ? window.location.origin : "http://localhost"
    );
    u.searchParams.set("mode", scope);
    if (status && status !== "all") u.searchParams.set("status", status);
    if (from) u.searchParams.set("from", from);
    if (to) u.searchParams.set("to", to);
    u.searchParams.set("format", format);
    u.searchParams.set("decimalFormat", decimalFormat);
    if (includePii) u.searchParams.set("includePii", "true");
    if (format === "xlsx" && password) u.searchParams.set("password", password);
    // Carry through current page's search context for current_view mode
    if (scope === "current_view" && typeof window !== "undefined") {
      const here = new URLSearchParams(window.location.search);
      const q = here.get("q");
      const view = here.get("view");
      if (q) u.searchParams.set("q", q);
      if (view) u.searchParams.set("view", view);
    }
    return u.pathname + "?" + u.searchParams.toString();
  }

  function onExport() {
    const url = buildUrl();
    window.open(url, "_blank", "noopener");
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export {entityLabel}</DialogTitle>
          <DialogDescription>
            You can export your data from Quikfinance in CSV, XLS, or XLSX
            format. Up to 25,000 rows per export.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          <div className="space-y-1">
            <Label>Module</Label>
            <Input value={entityLabel} readOnly className="bg-muted/40" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="exp-status">Select Status *</Label>
            <select
              id="exp-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-10 w-full rounded border px-2 bg-background text-sm"
            >
              {statusOptions.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {showDateRange ? (
            <div className="space-y-1">
              <Label>Date Range</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label="From date"
                />
                <span className="text-muted-foreground">—</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-label="To date"
                />
              </div>
            </div>
          ) : null}

          <div className="space-y-1">
            <Label>Scope</Label>
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                />
                All
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "current_view"}
                  onChange={() => setScope("current_view")}
                />
                Current view
              </label>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="exp-decimal">Decimal Format *</Label>
            <select
              id="exp-decimal"
              value={decimalFormat}
              onChange={(e) =>
                setDecimalFormat(e.target.value as "us" | "en" | "eu")
              }
              className="h-10 w-full rounded border px-2 bg-background text-sm"
            >
              {DECIMAL_FORMATS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label>Export File Format *</Label>
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="exp-format"
                  checked={format === "csv"}
                  onChange={() => setFormat("csv")}
                />
                CSV
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="exp-format"
                  checked={format === "xlsx"}
                  onChange={() => setFormat("xlsx")}
                />
                XLSX
              </label>
            </div>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={includePii}
              onChange={(e) => setIncludePii(e.target.checked)}
              className="mt-1"
            />
            <span>
              Include Sensitive Personally Identifiable Information (PII) such
              as customer email addresses.
            </span>
          </label>

          {format === "xlsx" ? (
            <div className="space-y-1">
              <Label htmlFor="exp-password">File Protection Password</Label>
              <div className="relative">
                <Input
                  id="exp-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Optional"
                  autoComplete="off"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                XLSX-only. Recipient will need this password to open the file.
              </p>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">
            Backup your data — exports are capped at 25,000 rows per request.
          </p>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={onExport} className="gap-1">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
