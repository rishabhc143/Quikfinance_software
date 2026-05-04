"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { z } from "zod";
import { Eye, EyeOff, Info, Lock, Download, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";

const passwordSchema = z
  .string()
  .min(12, "At least 12 characters")
  .regex(/[A-Z]/, "Must include uppercase")
  .regex(/[a-z]/, "Must include lowercase")
  .regex(/[0-9]/, "Must include a number")
  .regex(/[^A-Za-z0-9]/, "Must include a special character");

type Format = "csv" | "xls" | "xlsx";

export function ExportModal({
  open, onOpenChange, scope,
}: { open: boolean; onOpenChange: (v: boolean) => void; scope: "all" | "view" }) {
  const sp = useSearchParams();
  const [period, setPeriod] = React.useState<"all" | "specific">("all");
  const [decimalFormat, setDecimalFormat] = React.useState("1,234,567.89");
  const [format, setFormat] = React.useState<Format>("csv");
  const [includePII, setIncludePII] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [showPwd, setShowPwd] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const passwordRequired = format !== "csv";
  const passwordError = passwordRequired && password
    ? passwordSchema.safeParse(password).success ? null : "12+ chars, uppercase, lowercase, number, and special required"
    : null;

  async function handleExport() {
    if (passwordRequired && password && passwordError) {
      toast.error(passwordError);
      return;
    }
    setBusy(true);
    const url = new URL("/api/items/export", window.location.origin);
    url.searchParams.set("scope", scope);
    url.searchParams.set("format", format);
    url.searchParams.set("decimalFormat", decimalFormat);
    if (includePII) url.searchParams.set("pii", "1");
    if (password) url.searchParams.set("password", password);
    if (scope === "view") {
      sp.forEach((v, k) => url.searchParams.set(k, v));
      url.searchParams.set("scope", "view");
    }
    try {
      window.location.href = url.toString();
      toast.success("Your download is starting…");
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{scope === "all" ? "Export Items" : "Export Current View"}</DialogTitle>
        </DialogHeader>

        <Alert variant="info">
          <Info className="h-4 w-4" />
          <AlertDescription>
            {scope === "all"
              ? "You can export your data from Quikfinance in CSV, XLS or XLSX format."
              : "Only the current view with its visible columns will be exported. Sort, filter, and search are preserved."}
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          {scope === "all" && (
            <>
              <div>
                <Label>Module <span className="text-destructive">*</span></Label>
                <Input value="Items" readOnly disabled />
              </div>

              <div>
                <Label>Date Range</Label>
                <div className="flex items-center gap-4 mt-1.5 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={period === "all"} onChange={() => setPeriod("all")} />
                    All Items
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" checked={period === "specific"} onChange={() => setPeriod("specific")} />
                    Specific Period
                  </label>
                </div>
                {period === "specific" && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <Input type="date" name="from" />
                    <Input type="date" name="to" />
                  </div>
                )}
              </div>

              <div>
                <Label>Export Template</Label>
                <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option>None — default fields</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">User-saved templates land in a future release.</p>
              </div>
            </>
          )}

          <div>
            <Label>Decimal Format <span className="text-destructive">*</span></Label>
            <select
              value={decimalFormat}
              onChange={(e) => setDecimalFormat(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option>1234567.89</option>
              <option>1,234,567.89</option>
              <option>1.234.567,89</option>
            </select>
          </div>

          <div>
            <Label>Export File Format <span className="text-destructive">*</span></Label>
            <div className="flex items-center gap-4 mt-1.5 text-sm">
              {(["csv", "xls", "xlsx"] as const).map((f) => (
                <label key={f} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" checked={format === f} onChange={() => setFormat(f)} />
                  {f.toUpperCase()}
                </label>
              ))}
            </div>
          </div>

          {scope === "all" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includePII} onChange={(e) => setIncludePII(e.target.checked)} />
              Include Sensitive Personally Identifiable Information (PII) while exporting
            </label>
          )}

          <div>
            <Label htmlFor="exportPassword">File Protection Password</Label>
            <div className="relative">
              <Lock className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="exportPassword"
                type={showPwd ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={passwordRequired ? "12+ chars, uppercase, lowercase, number, special" : "Optional for CSV"}
                className="pl-9 pr-10"
                disabled={!passwordRequired}
              />
              <button
                type="button"
                onClick={() => setShowPwd((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-label={showPwd ? "Hide password" : "Show password"}
                disabled={!passwordRequired}
              >
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {passwordRequired && (
              <p className="text-xs text-muted-foreground mt-1">
                Applies to XLS/XLSX only. <strong>Note:</strong> XLSX password protection is queued for a future release; CSV/XLSX export today returns the file unprotected.
              </p>
            )}
            {passwordError && <p className="text-xs text-destructive mt-1">{passwordError}</p>}
          </div>

          <p className="text-xs text-muted-foreground">
            {scope === "all"
              ? "You can export only the first 25,000 rows in a single call."
              : "Only the first 10,000 rows of the current view will be exported."}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleExport} disabled={busy || (passwordRequired && !!password && !!passwordError)}>
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Export
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
