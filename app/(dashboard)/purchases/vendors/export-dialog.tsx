"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  exportVendorsAction,
  type VendorExportMode,
} from "./import/actions";

/**
 * Vendor export dialog — three-radio mode selector + scope, calls
 * `exportVendorsAction`, and triggers a CSV download in the browser.
 *
 * Per the master prompt's <vendors_spec>, the modes are:
 *   - Vendors                  (the vendor records themselves)
 *   - Vendor's Contact Persons (rows from ContactPerson joined on vendor)
 *   - Vendor's Addresses       (rows from ContactAddress joined on vendor)
 *
 * The third option is vendor-specific and is NOT present on the
 * customer export modal.
 *
 * Scope is binary: "All" exports every non-deleted vendor; "Active"
 * filters to `isInactive=false`. Capped at 25,000 rows per export.
 */

type Props = {
  trigger: React.ReactNode;
};

const MODE_OPTIONS: { value: VendorExportMode; title: string; desc: string }[] =
  [
    {
      value: "vendors",
      title: "Vendors",
      desc: "All vendor records and their primary contact details.",
    },
    {
      value: "contact_persons",
      title: "Vendor's Contact Persons",
      desc: "Linked contacts inside each vendor, joined to the vendor display name.",
    },
    {
      value: "addresses",
      title: "Vendor's Addresses",
      desc: "Billing / shipping / other addresses for each vendor.",
    },
  ];

export function ExportVendorsDialog({ trigger }: Props) {
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<VendorExportMode>("vendors");
  const [scope, setScope] = React.useState<"all" | "active">("active");
  const [busy, setBusy] = React.useState(false);

  async function runExport() {
    setBusy(true);
    try {
      const out = await exportVendorsAction({ mode, scope });
      // Build a CSV blob and trigger a download. We deliberately
      // don't roundtrip through an API route — the server action
      // already validated the org context.
      const blob = new Blob([out.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = out.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(
        `Exported ${out.rowCount} ${
          mode === "vendors"
            ? "vendor"
            : mode === "contact_persons"
            ? "contact"
            : "address"
        }${out.rowCount === 1 ? "" : "s"}`
      );
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Export vendors</DialogTitle>
          <DialogDescription>
            Choose what to export and the scope. Files include up to
            25,000 rows.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Module</Label>
            <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              Vendors
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">What to export</Label>
            <div className="space-y-2">
              {MODE_OPTIONS.map((m) => (
                <label
                  key={m.value}
                  className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted/40 ${
                    mode === m.value ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="exportMode"
                    value={m.value}
                    checked={mode === m.value}
                    onChange={() => setMode(m.value)}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-medium">{m.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {m.desc}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Scope</Label>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { v: "active" as const, label: "Active only" },
                  { v: "all" as const, label: "All (incl. inactive)" },
                ]
              ).map((s) => (
                <label
                  key={s.v}
                  className={`rounded-md border px-3 py-2 text-sm text-center cursor-pointer ${
                    scope === s.v ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    checked={scope === s.v}
                    onChange={() => setScope(s.v)}
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Export file format: <strong>CSV</strong>. XLS / XLSX with
            password protection lands in a follow-up.
          </p>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button onClick={runExport} disabled={busy} className="gap-1">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
