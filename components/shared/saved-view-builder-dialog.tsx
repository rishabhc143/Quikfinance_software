"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
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
import { createSavedViewAction } from "@/app/(dashboard)/sales/_saved-views/actions";

/**
 * "+ New Custom View" dialog. v2 (was v1 in M31).
 *
 * v1 only captured a status multi-select. v2 adds optional
 * date-range, amount-range, and customer multi-select sections.
 * Any combination of non-empty sections is saved as an `and` filter;
 * if only one section is non-empty, it's saved as that filter alone.
 */

type FilterChild =
  | { kind: "status"; value: string | string[] }
  | { kind: "dateRange"; field: string; from?: string; to?: string }
  | { kind: "amountRange"; field: string; min?: number; max?: number }
  | { kind: "customer"; ids: string[] };

type SavedFilterJson =
  | { kind: "all" }
  | FilterChild
  | { kind: "and"; filters: FilterChild[] };

export type CustomerOption = { id: string; label: string };

export function SavedViewBuilderDialog({
  module,
  trigger,
  statusOptions,
  /** Per-module default date field (e.g. issueDate, paymentDate). */
  dateField = "issueDate",
  /** Per-module default amount field (e.g. total, amount). */
  amountField = "total",
  /** Optional pre-loaded customers — if omitted the customer section
   *  is hidden. The list page passes its already-fetched customers in. */
  customerOptions,
}: {
  module: string;
  trigger: React.ReactNode;
  statusOptions: { value: string; label: string }[];
  dateField?: string;
  amountField?: string;
  customerOptions?: CustomerOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [statuses, setStatuses] = React.useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [amountMin, setAmountMin] = React.useState("");
  const [amountMax, setAmountMax] = React.useState("");
  const [customers, setCustomers] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  function reset() {
    setName("");
    setStatuses(new Set());
    setDateFrom("");
    setDateTo("");
    setAmountMin("");
    setAmountMax("");
    setCustomers(new Set());
  }

  function toggleStatus(v: string) {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  function toggleCustomer(id: string) {
    setCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function buildFilterJson(): SavedFilterJson | null {
    const parts: FilterChild[] = [];

    if (statuses.size > 0) {
      const values = Array.from(statuses);
      parts.push(
        values.length === 1
          ? { kind: "status", value: values[0] }
          : { kind: "status", value: values }
      );
    }

    if (dateFrom || dateTo) {
      const d: FilterChild = { kind: "dateRange", field: dateField };
      if (dateFrom) d.from = dateFrom;
      if (dateTo) d.to = dateTo;
      parts.push(d);
    }

    const minN = amountMin === "" ? undefined : Number(amountMin);
    const maxN = amountMax === "" ? undefined : Number(amountMax);
    if (
      (minN !== undefined && Number.isFinite(minN)) ||
      (maxN !== undefined && Number.isFinite(maxN))
    ) {
      const a: FilterChild = { kind: "amountRange", field: amountField };
      if (minN !== undefined && Number.isFinite(minN)) a.min = minN;
      if (maxN !== undefined && Number.isFinite(maxN)) a.max = maxN;
      parts.push(a);
    }

    if (customers.size > 0) {
      parts.push({ kind: "customer", ids: Array.from(customers) });
    }

    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];
    return { kind: "and", filters: parts };
  }

  async function onSave() {
    if (!name.trim()) {
      toast.error("Give your view a name");
      return;
    }
    const filterJson = buildFilterJson();
    if (!filterJson) {
      toast.error("Pick at least one filter (status, date, amount, or customer)");
      return;
    }
    setBusy(true);
    try {
      const r = await createSavedViewAction({
        module,
        name: name.trim(),
        filterJson,
      });
      if (!r.ok) {
        toast.error(r.error ?? "Save failed");
        return;
      }
      toast.success(`Saved view "${name.trim()}"`);
      reset();
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New custom view</DialogTitle>
          <DialogDescription>
            Combine any of the filters below. Empty sections are
            ignored. The view will appear in your Saved Views dropdown.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="sv-name">View name *</Label>
            <Input
              id="sv-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My open invoices > ₹10k"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Label>Status</Label>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((s) => {
                const isOn = statuses.has(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleStatus(s.value)}
                    aria-pressed={isOn}
                    className={
                      "rounded-full border px-3 py-1 text-xs transition-colors " +
                      (isOn
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-muted")
                    }
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <Label>Date range ({dateField})</Label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="From date"
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="To date"
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Amount range ({amountField})</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={amountMin}
                onChange={(e) => setAmountMin(e.target.value)}
                placeholder="min"
                aria-label="Minimum amount"
                className="flex-1 font-mono"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                value={amountMax}
                onChange={(e) => setAmountMax(e.target.value)}
                placeholder="max"
                aria-label="Maximum amount"
                className="flex-1 font-mono"
              />
            </div>
          </div>

          {customerOptions && customerOptions.length > 0 ? (
            <div className="space-y-1">
              <Label>Customers</Label>
              <div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-1">
                {customerOptions.map((c) => {
                  const isOn = customers.has(c.id);
                  return (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 text-sm cursor-pointer hover:bg-accent rounded px-2 py-1"
                    >
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={() => toggleCustomer(c.id)}
                      />
                      <span>{c.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {customers.size > 0
                  ? `${customers.size} selected`
                  : "Leave empty to include all customers"}
              </p>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={onSave} disabled={busy} className="gap-1">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Save view
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
