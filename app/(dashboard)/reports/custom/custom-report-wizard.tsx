"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Calendar,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  PlusCircle,
  Settings,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";
import { createCustomReportAction } from "@/app/(dashboard)/reports/actions";
import type { CustomReportSectionNode } from "@/lib/reports/custom-report-structure";

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
  /**
   * Step 2 structural node list (sections + formula rows in display
   * order). `null` for report types without a structure editor yet —
   * Step 2 then shows a "coming soon" message. Built server-side by
   * `buildCustomReportStructure` from the org's Chart of Accounts.
   */
  structure: CustomReportSectionNode[] | null;
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

const STEP_PLACEHOLDER: Record<number, string> = {
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
  structure,
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
  // "Compare Based on Period/Year" is a collapsible section (Zoho-style);
  // open by default so the Compare With control shows.
  const [compareOpen, setCompareOpen] = React.useState(true);
  const [advancedFilters, setAdvancedFilters] = React.useState<
    AdvancedFilter[]
  >([]);

  // Report name — defaults to the base report name, edited in
  // Preferences (step 3) and required on Create.
  const [name, setName] = React.useState(baseName);

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
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
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
          <div className="max-w-4xl space-y-6">
            {/* General fields — stacked labels, 2-column grid */}
            <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
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
              {/* keep Date Range alone on its row */}
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
        ) : step === 1 ? (
          <div className="max-w-5xl">
            <CustomizeRowsAndColumns
              rootLabel={baseName}
              structure={structure}
            />
          </div>
        ) : (
          <div className="max-w-2xl space-y-6">
            <div className="rounded-md border bg-muted/30 p-8 text-center">
              <p className="text-sm text-muted-foreground">
                {STEP_PLACEHOLDER[step]}
              </p>
            </div>

            {step === 3 ? (
              <div className="grid grid-cols-[10rem_20rem] items-center gap-4">
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
      <div className="sticky bottom-0 z-10 flex items-center gap-2 border-t bg-card px-6 py-3">
        {step > 0 ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            Back
          </Button>
        ) : null}
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

/**
 * Step 2 body — the "Customize Table" structural tree. Renders the
 * report's account-definition hierarchy as a 3-column table
 * (Account Definition / Account / Total). The Account + Total columns
 * are intentionally empty here: this step defines *structure*, not live
 * amounts. Drag handles, "+ New Section", and "Customize Columns" render
 * for visual parity but are stubs in this phase (toast "coming soon").
 *
 * `structure === null` → report type has no structure editor yet, so we
 * show a "coming soon" message (Next still advances the wizard).
 */
function CustomizeRowsAndColumns({
  rootLabel,
  structure,
}: {
  rootLabel: string;
  structure: CustomReportSectionNode[] | null;
}) {
  if (!structure) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-md border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Row and column customization for this report type is coming soon.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header chrome: title + Preview pill + Customize Columns link */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">Customize Table</h2>
          <span className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            Preview
          </span>
        </div>
        <button
          type="button"
          onClick={() => toast.info("Customize Columns is coming soon")}
          className="text-sm font-medium text-primary hover:underline"
        >
          Customize Columns
        </button>
      </div>

      {/* 3-column structural table */}
      <div className="overflow-hidden rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 text-left">Account Definition</th>
              <th className="w-40 px-4 py-2.5 text-left">Account</th>
              <th className="w-40 px-4 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {/* Root */}
            <tr className="border-b">
              <td className="px-4 py-2.5">
                <span className="flex items-center gap-2 font-semibold">
                  <Settings className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {rootLabel}
                </span>
              </td>
              <td className="px-4 py-2.5" />
              <td className="px-4 py-2.5" />
            </tr>

            {structure.map((node, i) =>
              node.kind === "section" ? (
                <React.Fragment key={node.key}>
                  {/* Section header */}
                  <tr className="border-b bg-muted/20">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-2 pl-4 font-medium">
                        <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                        <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                        {node.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5" />
                  </tr>

                  {/* Accounts */}
                  {node.accounts.length > 0 ? (
                    node.accounts.map((acc) => (
                      <tr key={acc.id} className="border-b">
                        <td className="px-4 py-2">
                          <span className="block pl-14 text-muted-foreground">
                            {acc.name}
                          </span>
                        </td>
                        <td className="px-4 py-2" />
                        <td className="px-4 py-2" />
                      </tr>
                    ))
                  ) : (
                    <tr className="border-b">
                      <td className="px-4 py-2">
                        <span className="block pl-14 text-xs italic text-muted-foreground/70">
                          No accounts in this section
                        </span>
                      </td>
                      <td className="px-4 py-2" />
                      <td className="px-4 py-2" />
                    </tr>
                  )}

                  {/* Section total */}
                  <tr className="border-b">
                    <td className="px-4 py-2.5">
                      <span className="block pl-14 font-semibold">
                        Total for {node.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5" />
                  </tr>
                </React.Fragment>
              ) : (
                <tr key={`formula-${i}`} className="border-b bg-muted/10">
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2 pl-4 font-semibold">
                      <span className="inline-flex h-5 items-center rounded bg-primary/10 px-1.5 font-mono text-xs italic text-primary">
                        fx
                      </span>
                      {node.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5" />
                </tr>
              )
            )}

            {/* + New Section (stub) */}
            <tr>
              <td colSpan={3} className="px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => toast.info("Adding sections is coming soon")}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <Plus className="h-4 w-4" />
                  New Section
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
