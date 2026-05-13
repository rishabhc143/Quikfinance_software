"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  Package,
  Users,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  BULK_UPDATE_FIELDS,
  type BulkUpdateCategory,
  type BulkUpdateField,
} from "@/lib/accountant/bulk-update";
import {
  applyBulkUpdateAction,
  listRowsForBulkUpdateAction,
  type BulkUpdateRow,
} from "./actions";

type Options = {
  TAXES: { value: string; label: string }[];
  PAYMENT_TERMS: { value: string; label: string }[];
};

type Step = 1 | 2 | 3 | 4 | 5;

const PAGE_SIZE = 50;

const CATEGORY_META: Record<
  BulkUpdateCategory,
  { label: string; icon: typeof Package }
> = {
  ITEMS: { label: "Items", icon: Package },
  CUSTOMERS: { label: "Customers", icon: Users },
  VENDORS: { label: "Vendors", icon: Building2 },
};

export function BulkUpdateWizard({ options }: { options: Options }) {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);
  const [category, setCategory] = React.useState<BulkUpdateCategory | null>(null);
  const [field, setField] = React.useState<BulkUpdateField | null>(null);
  const [search, setSearch] = React.useState("");
  const [filter, setFilter] = React.useState<"active" | "inactive" | "all">("active");
  const [page, setPage] = React.useState(1);
  const [rows, setRows] = React.useState<BulkUpdateRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(false);
  const [rawValue, setRawValue] = React.useState<string | boolean>("");
  const [applying, setApplying] = React.useState(false);

  const fieldList = category ? BULK_UPDATE_FIELDS[category] : [];

  // Load rows whenever we hit step 3 or its filter changes.
  React.useEffect(() => {
    if (step !== 3 || !category) return;
    let cancelled = false;
    setLoading(true);
    listRowsForBulkUpdateAction({
      category,
      search: search || null,
      filter,
      page,
      pageSize: PAGE_SIZE,
    })
      .then((r) => {
        if (cancelled) return;
        setRows(r.rows);
        setTotal(r.total);
      })
      .catch((e) =>
        toast.error(e instanceof Error ? e.message : "Failed to load rows")
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [step, category, search, filter, page]);

  function toggleId(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const r of rows) next.add(r.id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function selectAllInFilter() {
    if (!category) return;
    setLoading(true);
    try {
      // Walk pages — small data sets typically; cap to 5000 to avoid blowing up.
      const next = new Set<string>(selectedIds);
      const totalPages = Math.min(100, Math.ceil(total / PAGE_SIZE));
      for (let p = 1; p <= totalPages; p++) {
        const r = await listRowsForBulkUpdateAction({
          category,
          search: search || null,
          filter,
          page: p,
          pageSize: PAGE_SIZE,
        });
        for (const row of r.rows) next.add(row.id);
        if (next.size >= 5000) break;
      }
      setSelectedIds(next);
      toast.success(`Selected ${next.size} rows`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Select-all failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!category || !field) return;
    setApplying(true);
    try {
      const valueForServer =
        field.inputType === "boolean" ? Boolean(rawValue) : (rawValue as string);
      const res = await applyBulkUpdateAction({
        category,
        fieldKey: field.key,
        rawValue: valueForServer,
        ids: Array.from(selectedIds),
      });
      if (!res.ok) {
        toast.error(res.error ?? "Apply failed");
        setApplying(false);
        return;
      }
      toast.success(`Updated ${res.updated} ${CATEGORY_META[category].label.toLowerCase()}`);
      router.refresh();
      // Reset to step 1 so the user can start another batch.
      setStep(1);
      setCategory(null);
      setField(null);
      setSearch("");
      setFilter("active");
      setPage(1);
      setSelectedIds(new Set());
      setRawValue("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-4">
      <StepIndicator step={step} />

      {step === 1 ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Label className="text-sm">Pick a category</Label>
            <div className="grid gap-3 md:grid-cols-3">
              {(Object.keys(CATEGORY_META) as BulkUpdateCategory[]).map((c) => {
                const meta = CATEGORY_META[c];
                const Icon = meta.icon;
                const active = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={
                      "rounded-md border p-4 text-left transition-colors " +
                      (active
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "hover:bg-muted/40")
                    }
                  >
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div className="mt-2 font-medium">{meta.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {BULK_UPDATE_FIELDS[c].length} bulk-updatable fields
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setStep(2)}
                disabled={!category}
                className="gap-1"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 2 && category ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Label className="text-sm">Pick a field to update</Label>
            <ul className="divide-y rounded-md border">
              {fieldList.map((f) => {
                const active = field?.key === f.key;
                return (
                  <li key={f.key}>
                    <button
                      type="button"
                      onClick={() => setField(f)}
                      className={
                        "w-full text-left p-3 hover:bg-muted/40 flex items-start gap-3 " +
                        (active ? "bg-primary/5" : "")
                      }
                    >
                      <div
                        className={
                          "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 " +
                          (active ? "border-primary bg-primary" : "border-muted-foreground/40")
                        }
                      />
                      <div className="flex-1">
                        <div className="font-medium text-sm">{f.label}</div>
                        {f.hint ? (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {f.hint}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(1)} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!field}
                className="gap-1"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 && category && field ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={`Search ${CATEGORY_META[category].label.toLowerCase()}…`}
                className="max-w-xs"
              />
              <select
                value={filter}
                onChange={(e) => {
                  setFilter(e.target.value as "active" | "inactive" | "all");
                  setPage(1);
                }}
                className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="all">All</option>
              </select>
              <div className="ml-auto text-xs text-muted-foreground">
                {selectedIds.size} selected · {total} total
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={selectVisible}
                disabled={rows.length === 0}
              >
                Select visible
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={selectAllInFilter}
                disabled={total === 0 || loading}
              >
                Select all in filter ({total})
              </Button>
              {selectedIds.size > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={clearSelection}
                >
                  Clear selection
                </Button>
              ) : null}
            </div>

            <div className="rounded-md border overflow-hidden">
              {loading && rows.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading rows…
                </div>
              ) : rows.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No rows match. Try a different search or filter.
                </div>
              ) : (
                <ul className="divide-y max-h-[50vh] overflow-y-auto">
                  {rows.map((r) => {
                    const checked = selectedIds.has(r.id);
                    return (
                      <li key={r.id}>
                        <label className="flex items-center gap-3 p-3 hover:bg-muted/40 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={checked}
                            onChange={() => toggleId(r.id)}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{r.name}</div>
                            {r.subtitle ? (
                              <div className="text-xs text-muted-foreground truncate">
                                {r.subtitle}
                              </div>
                            ) : null}
                          </div>
                          {!r.active ? (
                            <Badge variant="outline" className="text-[10px]">
                              Inactive
                            </Badge>
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {total > PAGE_SIZE ? (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  Page {page} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                  >
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= Math.ceil(total / PAGE_SIZE) || loading}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(2)} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                onClick={() => setStep(4)}
                disabled={selectedIds.size === 0}
                className="gap-1"
              >
                Continue ({selectedIds.size}) <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 4 && field ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <Label className="text-sm">
              New {field.label.toLowerCase()} for {selectedIds.size} row
              {selectedIds.size === 1 ? "" : "s"}
            </Label>

            {field.inputType === "number" ? (
              <Input
                type="number"
                step="0.01"
                min={field.min ?? undefined}
                max={field.max ?? undefined}
                value={String(rawValue ?? "")}
                onChange={(e) => setRawValue(e.target.value)}
                placeholder="e.g. 495.00"
                className="max-w-xs"
              />
            ) : field.inputType === "text" ? (
              <Input
                type="text"
                value={String(rawValue ?? "")}
                onChange={(e) => setRawValue(e.target.value)}
                placeholder={
                  field.key === "currency" ? "INR / USD / EUR ..." : "Enter value…"
                }
                className="max-w-xs"
              />
            ) : field.inputType === "select" ? (
              <select
                value={String(rawValue ?? "")}
                onChange={(e) => setRawValue(e.target.value)}
                className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select…</option>
                {options[field.optionsKey ?? "TAXES"].map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={String(rawValue ?? "")}
                onChange={(e) => setRawValue(e.target.value)}
                className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select…</option>
                <option value="true">True (yes)</option>
                <option value="false">False (no)</option>
              </select>
            )}

            {field.hint ? (
              <p className="text-xs text-muted-foreground">{field.hint}</p>
            ) : null}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(3)} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                onClick={() => setStep(5)}
                disabled={
                  rawValue === "" ||
                  (field.inputType === "select" && rawValue === "")
                }
                className="gap-1"
              >
                Preview <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 5 && category && field ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="text-sm">
              <div className="font-medium">About to update</div>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>
                  Category:{" "}
                  <span className="text-foreground">{CATEGORY_META[category].label}</span>
                </li>
                <li>
                  Field:{" "}
                  <span className="text-foreground">{field.label}</span>
                </li>
                <li>
                  New value:{" "}
                  <span className="text-foreground font-mono">
                    {String(rawValue)}
                  </span>
                </li>
                <li>
                  Affected rows:{" "}
                  <span className="text-foreground font-medium">
                    {selectedIds.size}
                  </span>
                </li>
              </ul>
            </div>
            <div className="text-xs text-amber-700 dark:text-amber-400">
              This action overwrites the existing value on every selected row. There&apos;s no
              one-click undo — the change is logged in the audit log.
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(4)} className="gap-1">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
              <Button
                onClick={handleApply}
                disabled={applying}
                className="gap-1"
              >
                {applying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Apply update
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const labels = ["Category", "Field", "Select rows", "New value", "Apply"];
  return (
    <ol className="flex items-center gap-2 text-xs">
      {labels.map((s, i) => {
        const n = i + 1;
        const done = step > n;
        const active = step === n;
        return (
          <li
            key={s}
            className={
              "flex items-center gap-2 " +
              (active
                ? "text-foreground font-semibold"
                : done
                  ? "text-muted-foreground"
                  : "text-muted-foreground/60")
            }
          >
            <span
              className={
                "h-5 w-5 rounded-full border flex items-center justify-center " +
                (done
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "")
              }
            >
              {done ? <CheckCircle2 className="h-3 w-3" /> : n}
            </span>
            {s}
            {i < labels.length - 1 ? (
              <span className="text-muted-foreground/50">›</span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
