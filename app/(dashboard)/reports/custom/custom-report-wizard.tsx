"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronDown, PlusCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { createCustomReportAction } from "@/app/(dashboard)/reports/actions";

/**
 * REPORTS — "Create Custom Report" form (single General step).
 *
 * Reached from the Reports Center modal: the user picks a base report and
 * clicks Proceed, which navigates here with `?base=<reportKey>`. The form
 * lets them name the report and configure General filters (date range,
 * basis, filter accounts, compare period, advanced filters). Create
 * persists via `createCustomReportAction` ({ name, reportKey, params }) and
 * routes to /reports?tab=my; the saved report applies the chosen filters
 * when opened.
 *
 * Earlier iterations also shipped Customize Rows / Customize Columns /
 * Report Layout / Report Preferences steps to mirror Zoho — stripped
 * because they were cosmetic until wired through every report generator,
 * and the General step is the part real users actually use. The deleted
 * surface lives in git history (PRs #280, #283, #284, #285, #286, #287,
 * #288) if we ever bring it back.
 */

type WizardProps = {
  baseKey: string;
  baseName: string;
};

type AdvancedFilter = {
  id: string;
  field: string;
  op: string;
  value: string;
};

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

// "Compare With" (under "Compare Based on Period/Year"). None = no
// comparison column; the other two add a prior-year / prior-period
// column to the report.
const COMPARE_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "None" },
  { value: "previous-year", label: "Previous Year(s)" },
  { value: "previous-period", label: "Previous Period(s)" },
];

// "Filter Accounts" modes (Zoho-parity). These are filter *modes*, not
// individual accounts — `hint` renders as the sub-description in the
// Combobox dropdown.
const FILTER_ACCOUNT_OPTIONS: { value: string; label: string; hint: string }[] =
  [
    {
      value: "without-zero-balance",
      label: "Accounts Without Zero Balance",
      hint: "Filter every account except the ones with zero-balance.",
    },
    {
      value: "all",
      label: "All Accounts",
      hint: "Filter all accounts, including the ones with zero-balance.",
    },
    {
      value: "with-transactions",
      label: "Accounts With Transactions",
      hint: "Filter the accounts with transactions that were created during the specified period.",
    },
  ];

const FILTER_OP_OPTIONS: { value: string; label: string }[] = [
  { value: "equals", label: "equals" },
  { value: "not-equals", label: "not equals" },
  { value: "contains", label: "contains" },
  { value: "greater-than", label: "greater than" },
  { value: "less-than", label: "less than" },
];

/** Shared styling for native <select> controls to match the Input. */
const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function newFilterId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now());
}

export function CustomReportWizard({ baseKey, baseName }: WizardProps) {
  const router = useRouter();

  // Form state — name defaults to the base report name; everything else
  // mirrors the default "run this report now" experience.
  const [name, setName] = React.useState(baseName);
  const [dateRange, setDateRange] = React.useState("today");
  const [reportBasis, setReportBasis] = React.useState("accrual");
  const [filterAccount, setFilterAccount] = React.useState<string | null>(
    "all"
  );
  const [compareWith, setCompareWith] = React.useState("none");
  // "Compare Based on Period/Year" is a collapsible section (Zoho-style);
  // open by default so the Compare With control shows.
  const [compareOpen, setCompareOpen] = React.useState(true);
  const [advancedFilters, setAdvancedFilters] = React.useState<
    AdvancedFilter[]
  >([]);

  const [pending, startTransition] = React.useTransition();

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
    <div className="flex min-h-[calc(100vh-4rem)] flex-col">
      {/* ───── Top bar: title + X close ───── */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-card px-6 py-4">
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

      {/* ───── Body: General form ───── */}
      <div className="flex-1 px-6 py-6">
        <div className="max-w-4xl space-y-6">
          {/* Report Name + General fields — stacked labels, 2-col grid */}
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
            {/* Report Name (own row) */}
            <div className="space-y-1.5">
              <Label htmlFor="cr-name">Report Name</Label>
              <Input
                id="cr-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Report name"
              />
            </div>
            <div className="hidden sm:block" aria-hidden />

            {/* Date Range (own row) */}
            <div className="space-y-1.5">
              <Label htmlFor="cr-date-range">Date Range</Label>
              <div className="relative">
                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  id="cr-date-range"
                  value={dateRange}
                  onChange={(e) => setDateRange(e.target.value)}
                  className={cn(SELECT_CLASS, "pl-9")}
                >
                  {DATE_RANGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="hidden sm:block" aria-hidden />

            {/* Report Basis */}
            <div className="space-y-1.5">
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

            {/* Filter Accounts */}
            <div className="space-y-1.5">
              <Label>Filter Accounts</Label>
              <Combobox
                options={FILTER_ACCOUNT_OPTIONS}
                value={filterAccount}
                onChange={setFilterAccount}
                placeholder="All Accounts"
                stackedOptions
              />
            </div>
          </div>

          <div className="border-t border-border" />

          {/* COMPARE section */}
          <div className="space-y-4">
            <div className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Compare
              </h2>
              <button
                type="button"
                onClick={() => setCompareOpen((o) => !o)}
                aria-expanded={compareOpen}
                className="flex items-center gap-1.5 text-sm font-semibold"
              >
                Compare Based on Period/Year
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-muted-foreground transition-transform",
                    compareOpen ? "" : "-rotate-90"
                  )}
                />
              </button>
            </div>
            {compareOpen ? (
              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="cr-compare-with">Compare With</Label>
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
            ) : null}
          </div>

          <div className="border-t border-border" />

          {/* Advanced Filters section */}
          <div className="space-y-3">
            <div className="space-y-1">
              <h2 className="text-base font-semibold">Advanced Filters</h2>
              <p className="text-sm text-muted-foreground">
                Use advanced filters to filter the report based on its fields.
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

            <button
              type="button"
              onClick={addFilter}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <PlusCircle className="h-4 w-4" />
              Add Filters
            </button>
          </div>
        </div>
      </div>

      {/* ───── Footer ───── */}
      <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t bg-card px-6 py-3">
        <Button type="button" onClick={onCreate} disabled={!canCreate}>
          {pending ? "Creating…" : "Create"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/reports")}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
