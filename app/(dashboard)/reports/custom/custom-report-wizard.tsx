"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { createCustomReportAction } from "@/app/(dashboard)/reports/actions";

/**
 * REPORTS — "Create Custom Report" 4-step wizard (Phase 1).
 *
 * Mirrors Zoho's Create Custom Report flow:
 *   Step 1 General — fully functional: Date Range, Report Basis,
 *     Filter Accounts, a Compare section, and Advanced Filters (add /
 *     remove filter rows; not yet wired into any query).
 *   Steps 2-4 (Customize Rows and Columns / Report Layout / Report
 *     Preferences) — navigable scaffolds for now. Preferences also
 *     exposes the report-name field used on Create.
 *
 * On the final step, Create persists the report via
 * `createCustomReportAction` ({ name, reportKey, params }) and routes
 * to /reports?tab=my. `params` is built from the General selections as
 * a URL query string (the same shape report pages read).
 */

type WizardProps = {
  baseKey: string;
  baseName: string;
  baseHref: string | null;
  accountOptions: { value: string; label: string }[];
};

type AdvancedFilter = {
  id: string;
  field: string;
  op: string;
  value: string;
};

const STEPS = [
  "General",
  "Customize Rows and Columns",
  "Report Layout",
  "Report Preferences",
] as const;

const DATE_RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this-month", label: "This Month" },
  { value: "this-quarter", label: "This Quarter" },
  { value: "this-year", label: "This Year" },
  { value: "previous-month", label: "Previous Month" },
  { value: "previous-quarter", label: "Previous Quarter" },
  { value: "previous-year", label: "Previous Year" },
  { value: "custom", label: "Custom" },
];

const COMPARE_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "None" },
  { value: "previous-period", label: "Previous Period" },
  { value: "previous-year", label: "Previous Year" },
];

const FILTER_OP_OPTIONS: { value: string; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not-equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "greater-than", label: "greater than" },
  { value: "less-than", label: "less than" },
];

const STEP_PLACEHOLDER: Record<number, string> = {
  1: "Customize Rows and Columns — configured in an upcoming step.",
  2: "Report Layout — configured in an upcoming step.",
  3: "Report Preferences — configured in an upcoming step.",
};

/** Shared styling for native <select> controls to match the Input. */
const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function newFilterId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
}

export function CustomReportWizard({
  baseKey,
  baseName,
  // baseHref is part of the prop contract (the page passes the base
  // report's route) and will drive the live preview in a later phase;
  // unused in Phase 1.
  accountOptions,
}: WizardProps) {
  const router = useRouter();

  const [step, setStep] = React.useState(0);

  // ── Step 1 (General) state ──────────────────────────────────────
  const [dateRange, setDateRange] = React.useState("today");
  const [reportBasis, setReportBasis] = React.useState("accrual");
  const [filterAccount, setFilterAccount] = React.useState<string | null>(
    "all"
  );
  const [compareWith, setCompareWith] = React.useState("none");
  const [advancedFilters, setAdvancedFilters] = React.useState<
    AdvancedFilter[]
  >([]);

  // Report name — defaults to the base report name, edited in
  // Preferences (step 3) and required on Create.
  const [name, setName] = React.useState(baseName);

  const [pending, startTransition] = React.useTransition();

  const accountComboOptions = React.useMemo(
    () => [{ value: "all", label: "All Accounts" }, ...accountOptions],
    [accountOptions]
  );

  function addFilter() {
    setAdvancedFilters((rows) => [
      ...rows,
      { id: newFilterId(), field: "", op: "equals", value: "" },
    ]);
  }

  function updateFilter(id: string, patch: Partial<AdvancedFilter>) {
    setAdvancedFilters((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  }

  function removeFilter(id: string) {
    setAdvancedFilters((rows) => rows.filter((r) => r.id !== id));
  }

  function onCreate() {
    const params = new URLSearchParams();
    if (dateRange) params.set("dateRange", dateRange);
    if (reportBasis) params.set("basis", reportBasis);
    if (filterAccount && filterAccount !== "all")
      params.set("account", filterAccount);
    if (compareWith && compareWith !== "none")
      params.set("compareWith", compareWith);

    startTransition(async () => {
      const res = await createCustomReportAction({
        name: name.trim(),
        reportKey: baseKey,
        params: params.toString(),
      });
      if (res.ok) {
        toast.success("Custom report created");
        router.push("/reports?tab=my");
      } else {
        toast.error(res.error ?? "Couldn't create custom report");
      }
    });
  }

  const canCreate = Boolean(name.trim()) && !pending;

  return (
    <div className="-m-6 flex flex-col min-h-[calc(100vh-4rem)]">
      {/* ───── Top bar: title + X close ───── */}
      <div className="flex items-center justify-between border-b bg-card px-6 py-4 sticky top-0 z-10">
        <h1 className="text-xl font-semibold leading-tight">
          Create Custom Report
        </h1>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Close"
          className="rounded-full"
          onClick={() => router.push("/reports")}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* ───── Step indicator ───── */}
      <div className="border-b bg-muted/30 px-6 py-3">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
          {STEPS.map((label, i) => {
            const active = i === step;
            const completed = i < step;
            return (
              <li key={label} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep(i)}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors",
                    active
                      ? "text-primary font-semibold"
                      : completed
                        ? "text-foreground/70 hover:text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : completed
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-input bg-background text-muted-foreground"
                    )}
                  >
                    {i + 1}
                  </span>
                  <span>{label}</span>
                </button>
                {i < STEPS.length - 1 ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>

      {/* ───── Body ───── */}
      <div className="flex-1 px-6 py-6">
        {step === 0 ? (
          <div className="max-w-2xl space-y-8">
            {/* General fields */}
            <div className="space-y-5">
              <div className="grid grid-cols-[12rem_1fr] items-center gap-4">
                <Label htmlFor="cr-date-range">Date Range</Label>
                <select
                  id="cr-date-range"
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {DATE_RANGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-[12rem_1fr] items-center gap-4">
                <Label htmlFor="cr-report-basis">Report Basis</Label>
                <select
                  id="cr-report-basis"
                  value={reportBasis}
                  onChange={(e) => setReportBasis(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="accrual">Accrual</option>
                  <option value="cash">Cash</option>
                </select>
              </div>

              <div className="grid grid-cols-[12rem_1fr] items-center gap-4">
                <Label>Filter Accounts</Label>
                <Combobox
                  options={accountComboOptions}
                  value={filterAccount}
                  onChange={setFilterAccount}
                  placeholder="All Accounts"
                />
              </div>
            </div>

            {/* COMPARE section */}
            <div className="space-y-4">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Compare
              </h2>
              <div className="grid grid-cols-[12rem_1fr] items-center gap-4">
                <Label htmlFor="cr-compare-with">
                  Compare Based on Period/Year
                </Label>
                <select
                  id="cr-compare-with"
                  value={compareWith}
                  onChange={(e) => setCompareWith(e.target.value)}
                  className={SELECT_CLASS}
                >
                  {COMPARE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Advanced Filters section */}
            <div className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Advanced Filters
                </h2>
                <p className="text-sm text-muted-foreground">
                  Narrow the report to specific records by adding one or more
                  field conditions.
                </p>
              </div>

              {advancedFilters.length > 0 ? (
                <div className="space-y-3">
                  {advancedFilters.map((f) => (
                    <div
                      key={f.id}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <Input
                        value={f.field}
                        onChange={(e) =>
                          updateFilter(f.id, { field: e.target.value })
                        }
                        placeholder="Field name"
                        className="w-48"
                        aria-label="Filter field"
                      />
                      <select
                        value={f.op}
                        onChange={(e) =>
                          updateFilter(f.id, { op: e.target.value })
                        }
                        className={cn(SELECT_CLASS, "w-40")}
                        aria-label="Filter operator"
                      >
                        {FILTER_OP_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={f.value}
                        onChange={(e) =>
                          updateFilter(f.id, { value: e.target.value })
                        }
                        placeholder="Value"
                        className="w-48"
                        aria-label="Filter value"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove filter"
                        onClick={() => removeFilter(f.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}

              <Button type="button" variant="outline" onClick={addFilter}>
                <Plus className="mr-1.5 h-4 w-4" />
                Add Filters
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            <div className="rounded-md border bg-muted/30 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                {STEP_PLACEHOLDER[step]}
              </p>
            </div>

            {step === 3 ? (
              <div className="grid grid-cols-[12rem_1fr] items-center gap-4">
                <Label htmlFor="cr-report-name">Report name</Label>
                <Input
                  id="cr-report-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Report name"
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* ───── Footer ───── */}
      <div className="sticky bottom-0 z-10 flex items-center justify-between border-t bg-card px-6 py-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push("/reports")}
          >
            Cancel
          </Button>
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              Back
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {step < STEPS.length - 1 ? (
            <Button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            >
              Next
            </Button>
          ) : (
            <Button type="button" onClick={onCreate} disabled={!canCreate}>
              {pending ? "Creating…" : "Create"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
