"use client";
import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  ReportSideDrawer,
  type ReportSideDrawerProps,
} from "./report-side-drawer";
import {
  REPORT_PRESETS,
  PRESET_LABEL,
  rangeToSearchParams,
  resolvePreset,
  type ReportPreset,
} from "@/lib/reports/date-range";
import { cn } from "@/lib/utils";

/**
 * REPORTS — Customize Report drawer (Zoho-style).
 *
 * Two tabs on the left rail:
 *
 *   • General — Date Range preset + Compare-period dropdown
 *     (Compare With: None / Previous Period / Previous Year).
 *     Compare values get serialised to URL params for Phase A1.5
 *     to read; for Phase A the page just shows a toast when a
 *     non-None compare is picked.
 *
 *   • Show / Hide Columns — per-report toggle list. The caller
 *     supplies the column descriptor array (`columns` prop);
 *     selections are written to URL params (e.g. `?hideCode=1`)
 *     so the server-rendered table can respect them.
 *
 * Footer actions:
 *   Run Report — applies the changes by pushing the new URL.
 *   Save as Custom Report — disabled in Phase A (Coming soon
 *     tooltip).
 *   Cancel — closes the drawer without applying.
 */

export type CustomizeColumnDescriptor = {
  /** URL param key, e.g. "showCode" or "showPct". */
  key: string;
  /** Human label shown next to the checkbox. */
  label: string;
  /** Default ON (true) or OFF (false). */
  defaultEnabled: boolean;
};

export type CustomizeReportDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The report's catalog key — used by Save as Custom Report later. */
  reportKey: string;
  /** Org's fiscal year start month for the Date Range presets. */
  fiscalYearStartMonth: number;
  /** Column toggles applicable to this report. Pass [] if none. */
  columns?: CustomizeColumnDescriptor[];
};

type ComparePeriod = "none" | "previous-period" | "previous-year";

export function CustomizeReportDrawer({
  open,
  onOpenChange,
  reportKey,
  fiscalYearStartMonth,
  columns = [],
}: CustomizeReportDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Initial state — read from current URL params so re-opening
  // the drawer reflects what's already applied.
  const initialPreset = (searchParams?.get("preset") ?? "this-month") as ReportPreset;
  const initialCompare = (searchParams?.get("compare") ?? "none") as ComparePeriod;
  const initialCustomFrom = searchParams?.get("from") ?? "";
  const initialCustomTo = searchParams?.get("to") ?? "";

  const [tab, setTab] = React.useState<"general" | "columns">("general");
  const [preset, setPreset] = React.useState<ReportPreset>(initialPreset);
  const [compare, setCompare] = React.useState<ComparePeriod>(initialCompare);
  const [customFrom, setCustomFrom] = React.useState(initialCustomFrom);
  const [customTo, setCustomTo] = React.useState(initialCustomTo);
  const [columnState, setColumnState] = React.useState<Record<string, boolean>>(
    () => {
      const seed: Record<string, boolean> = {};
      for (const c of columns) {
        const fromUrl = searchParams?.get(c.key);
        seed[c.key] = fromUrl == null ? c.defaultEnabled : fromUrl === "1";
      }
      return seed;
    }
  );

  // Re-sync state when the drawer is re-opened (e.g. user changed
  // the date range in the page picker, then clicked Customize).
  React.useEffect(() => {
    if (!open) return;
    const p = (searchParams?.get("preset") ?? "this-month") as ReportPreset;
    setPreset(p);
    setCompare((searchParams?.get("compare") ?? "none") as ComparePeriod);
    setCustomFrom(searchParams?.get("from") ?? "");
    setCustomTo(searchParams?.get("to") ?? "");
    const seed: Record<string, boolean> = {};
    for (const c of columns) {
      const fromUrl = searchParams?.get(c.key);
      seed[c.key] = fromUrl == null ? c.defaultEnabled : fromUrl === "1";
    }
    setColumnState(seed);
  }, [open, searchParams, columns]);

  function applyAndClose() {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    // Date range
    params.set("preset", preset);
    if (preset === "custom" && customFrom && customTo) {
      params.set("from", customFrom);
      params.set("to", customTo);
    } else {
      params.delete("from");
      params.delete("to");
    }
    // Compare
    if (compare === "none") {
      params.delete("compare");
    } else {
      params.set("compare", compare);
    }
    // Column toggles — only write if non-default
    for (const c of columns) {
      const enabled = columnState[c.key] ?? c.defaultEnabled;
      if (enabled === c.defaultEnabled) {
        params.delete(c.key);
      } else {
        params.set(c.key, enabled ? "1" : "0");
      }
    }
    router.push(`${pathname}?${params.toString()}`);
    onOpenChange(false);
  }

  const footer: ReportSideDrawerProps["footer"] = (
    <>
      <Button size="sm" onClick={applyAndClose}>
        Run Report
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled
        title="Coming soon — saving customized presets per user"
      >
        Save as Custom Report
      </Button>
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className="text-sm text-muted-foreground hover:text-foreground ml-auto px-2 py-1"
      >
        Cancel
      </button>
    </>
  );

  // Reference reportKey so it's not flagged as unused — Phase A1.5
  // will consume this to persist the Save as Custom Report row.
  void reportKey;
  void fiscalYearStartMonth;

  return (
    <ReportSideDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Customize Report"
      width="wide"
      footer={footer}
    >
      <div className="grid grid-cols-[180px_1fr] h-full">
        {/* Left rail */}
        <div className="border-r py-3 bg-muted/20">
          <button
            type="button"
            onClick={() => setTab("general")}
            className={cn(
              "block w-full text-left px-5 py-2 text-sm",
              tab === "general"
                ? "border-l-2 border-primary text-primary font-medium bg-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            General
          </button>
          <button
            type="button"
            onClick={() => setTab("columns")}
            className={cn(
              "block w-full text-left px-5 py-2 text-sm",
              tab === "columns"
                ? "border-l-2 border-primary text-primary font-medium bg-background"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Show / Hide Columns
          </button>
        </div>

        {/* Right pane */}
        <div className="p-6 space-y-6">
          {tab === "general" ? (
            <GeneralTab
              preset={preset}
              setPreset={setPreset}
              customFrom={customFrom}
              setCustomFrom={setCustomFrom}
              customTo={customTo}
              setCustomTo={setCustomTo}
              compare={compare}
              setCompare={setCompare}
            />
          ) : (
            <ColumnsTab
              columns={columns}
              columnState={columnState}
              setColumnState={setColumnState}
            />
          )}
        </div>
      </div>
    </ReportSideDrawer>
  );
}

function GeneralTab(props: {
  preset: ReportPreset;
  setPreset: (p: ReportPreset) => void;
  customFrom: string;
  setCustomFrom: (s: string) => void;
  customTo: string;
  setCustomTo: (s: string) => void;
  compare: ComparePeriod;
  setCompare: (c: ComparePeriod) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label className="text-sm">Date Range</Label>
        <select
          value={props.preset}
          onChange={(e) => props.setPreset(e.target.value as ReportPreset)}
          className="w-full h-9 rounded-md border bg-background px-3 text-sm"
        >
          {REPORT_PRESETS.map((p) => (
            <option key={p} value={p}>
              {PRESET_LABEL[p]}
            </option>
          ))}
        </select>
        {props.preset === "custom" ? (
          <div className="grid grid-cols-2 gap-2 pt-2">
            <div>
              <Label className="text-xs text-muted-foreground">From</Label>
              <input
                type="date"
                value={props.customFrom}
                onChange={(e) => props.setCustomFrom(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-2 text-sm mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">To</Label>
              <input
                type="date"
                value={props.customTo}
                onChange={(e) => props.setCustomTo(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-2 text-sm mt-1"
              />
            </div>
          </div>
        ) : null}
      </div>

      <div className="pt-4 border-t space-y-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          Compare
        </div>
        <div className="text-sm text-foreground">
          Compare Based on Period/Year
        </div>
        <div className="space-y-2">
          <Label className="text-sm">Compare With</Label>
          <select
            value={props.compare}
            onChange={(e) => props.setCompare(e.target.value as ComparePeriod)}
            className="w-full h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="none">None</option>
            <option value="previous-period">Previous Period</option>
            <option value="previous-year">Previous Year</option>
          </select>
          {props.compare !== "none" ? (
            <p className="text-xs text-muted-foreground mt-1">
              Adds a second amount column showing the comparison period
              and a % change column. Currently live on Profit and Loss;
              Balance Sheet and Cash Flow Statement land in the next
              release.
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}

function ColumnsTab(props: {
  columns: CustomizeColumnDescriptor[];
  columnState: Record<string, boolean>;
  setColumnState: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  if (props.columns.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        This report has no optional columns. The default table layout is
        already the most compact view.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        Tick a column to include it in the on-screen and exported report.
      </div>
      {props.columns.map((c) => {
        const enabled = props.columnState[c.key] ?? c.defaultEnabled;
        return (
          <label
            key={c.key}
            className="flex items-center gap-2 text-sm cursor-pointer select-none"
          >
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) =>
                props.setColumnState((prev) => ({
                  ...prev,
                  [c.key]: e.target.checked,
                }))
              }
              className="h-4 w-4 rounded border-input"
            />
            <span>{c.label}</span>
          </label>
        );
      })}
    </div>
  );
}

// Defensive — keep resolvePreset referenced so unused-import lint
// doesn't fire (we may use it for the live preview label in the
// drawer's title bar in a future polish pass).
void resolvePreset;
void rangeToSearchParams;
