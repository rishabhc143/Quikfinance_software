import * as React from "react";
import { Card } from "@/components/ui/card";
import { ReportShell } from "@/components/reports/report-shell";
import { ReportToolbar } from "@/components/reports/report-toolbar";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money";
import {
  defaultAlign,
  formatCellForDisplay,
  type ListReportColumn,
} from "@/lib/reports/list-report-helpers";
import type { CustomizeColumnDescriptor } from "@/components/reports/customize-report-drawer";

/**
 * REPORTS-INFRA — Generic report shell for list & summary reports.
 *
 * Wraps the boilerplate that every list/summary report needs:
 *   - ReportShell (page title + back arrow)
 *   - Filter strip slot (caller passes any combination of pills)
 *   - ReportToolbar (Customize / Schedule / Export / Activity)
 *   - Table with auto-formatted columns (text / number / money /
 *     date / datetime) and alignment
 *   - Optional grand-total row
 *   - Optional grouping (rows pre-grouped by caller; the template
 *     just renders group header rows interspersed with data rows)
 *   - Empty-state message
 *
 * Pages still own:
 *   - Data fetching + aggregation (server component)
 *   - URL-param parsing
 *   - Column descriptors
 *   - Filter-strip composition (we pass it as a slot)
 *
 * Example usage:
 *
 *   <ListReportTemplate
 *     reportKey="receivables-summary"
 *     title="Receivables Summary"
 *     subtitle={<span>As of {asOfDisplay}</span>}
 *     filterStrip={<ReportFilterStrip>{...}</ReportFilterStrip>}
 *     toolbar={{
 *       fiscalYearStartMonth: org.fiscalYearStart,
 *       exportBaseUrl: "/reports/receivables-summary/export",
 *       exportParams: exportParams.toString(),
 *       customizableColumns: COLUMN_DESCRIPTORS,
 *       activityRows,
 *       existingSchedule,
 *     }}
 *     columns={columns}
 *     rows={rows}
 *     totals={{ balanceDue: grandTotal }}
 *     emptyMessage="No outstanding receivables."
 *     currency={org.currency}
 *   />
 */
export interface ListReportTemplateProps<TRow extends Record<string, unknown>> {
  /** Stable identity for the toolbar (matches reportKey in cron/activity). */
  reportKey: string;
  /** Display title in the ReportShell header. */
  title: string;
  /** Optional subtitle (e.g., "As of dd/MM/yyyy"). */
  subtitle?: React.ReactNode;
  /** Filter strip — caller passes a full `<ReportFilterStrip>` with pills. */
  filterStrip?: React.ReactNode;
  /** Toolbar config — passed through to `<ReportToolbar>`. */
  toolbar: {
    reportTitle?: string;
    fiscalYearStartMonth: number;
    exportBaseUrl: string;
    exportParams: string;
    customizableColumns?: CustomizeColumnDescriptor[];
    activityRows?: React.ComponentProps<typeof ReportToolbar>["activityRows"];
    existingSchedule?: React.ComponentProps<typeof ReportToolbar>["existingSchedule"];
  };
  /** Columns to render (in order). */
  columns: ListReportColumn<TRow>[];
  /** Pre-fetched + aggregated rows. */
  rows: TRow[];
  /** Optional grand-total row. Keys must match column keys; only
   *  columns named here render a total; others show blank. */
  totals?: Partial<Record<keyof TRow, number>>;
  /** Optional grouping — when set, rows are expected to already be
   *  sorted by this key; the template inserts a group header row at
   *  each transition. */
  groupBy?: keyof TRow & string;
  /** Override group header label rendering. */
  renderGroupHeader?: (groupValue: unknown, count: number) => React.ReactNode;
  /** Message shown when `rows.length === 0`. */
  emptyMessage?: string;
  /** Currency code for money columns (used by `formatMoney`). */
  currency: string;
  /** Optional report-level header rendered above the table (e.g.
   *  centered org name + report title for PDF parity). */
  reportHeader?: React.ReactNode;
  /** Optional footnote rendered below the table. */
  footnote?: React.ReactNode;
}

export function ListReportTemplate<TRow extends Record<string, unknown>>({
  reportKey,
  title,
  subtitle,
  filterStrip,
  toolbar,
  columns,
  rows,
  totals,
  groupBy,
  renderGroupHeader,
  emptyMessage = "No data for the selected filters.",
  currency,
  reportHeader,
  footnote,
}: ListReportTemplateProps<TRow>) {
  const fmt = (n: number) => formatMoney(n, currency);

  // Pre-compute group transitions when grouping is enabled. The
  // template assumes rows are already sorted by groupBy.
  const groupBoundaries: { row: TRow; index: number; count: number }[] = [];
  if (groupBy) {
    let lastValue: unknown = undefined;
    let runStart = 0;
    rows.forEach((r, i) => {
      const v = r[groupBy];
      if (v !== lastValue) {
        if (i > runStart) {
          groupBoundaries[groupBoundaries.length - 1].count = i - runStart;
        }
        groupBoundaries.push({ row: r, index: i, count: 1 });
        lastValue = v;
        runStart = i;
      }
    });
    if (groupBoundaries.length > 0) {
      groupBoundaries[groupBoundaries.length - 1].count =
        rows.length - runStart;
    }
  }

  return (
    <ReportShell
      title={title}
      subtitle={subtitle}
      range={filterStrip}
      actions={
        <ReportToolbar
          reportKey={reportKey}
          reportTitle={toolbar.reportTitle ?? title}
          fiscalYearStartMonth={toolbar.fiscalYearStartMonth}
          exportBaseUrl={toolbar.exportBaseUrl}
          exportParams={toolbar.exportParams}
          columns={toolbar.customizableColumns ?? []}
          activityRows={toolbar.activityRows ?? []}
          existingSchedule={toolbar.existingSchedule ?? null}
        />
      }
    >
      <Card className="p-0 overflow-hidden">
        {reportHeader ? (
          <div className="text-center space-y-1 pt-8 pb-6">{reportHeader}</div>
        ) : null}

        {rows.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                {columns.map((c) => {
                  const align = c.align ?? defaultAlign(c.type);
                  return (
                    <th
                      key={c.key}
                      className={cn(
                        "p-3",
                        align === "right" && "text-right",
                        align === "center" && "text-center",
                        align === "left" && "text-left",
                        c.widthClass,
                      )}
                    >
                      {c.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, rowIdx) => {
                const groupHeaderHere = groupBy
                  ? groupBoundaries.find((g) => g.index === rowIdx)
                  : undefined;
                return (
                  <React.Fragment key={rowIdx}>
                    {groupHeaderHere ? (
                      <tr className="bg-muted/10">
                        <td
                          colSpan={columns.length}
                          className="px-3 py-2 font-semibold text-sm"
                        >
                          {renderGroupHeader
                            ? renderGroupHeader(
                                groupHeaderHere.row[groupBy!],
                                groupHeaderHere.count,
                              )
                            : String(groupHeaderHere.row[groupBy!] ?? "—")}
                        </td>
                      </tr>
                    ) : null}
                    <tr className="hover:bg-muted/30">
                      {columns.map((c) => {
                        const align = c.align ?? defaultAlign(c.type);
                        const v = row[c.key];
                        return (
                          <td
                            key={c.key}
                            className={cn(
                              "p-3",
                              align === "right" && "text-right tabular-nums",
                              align === "center" && "text-center",
                              align === "left" && "text-left",
                              c.widthClass,
                            )}
                          >
                            {c.render
                              ? c.render(v, row)
                              : formatCellForDisplay(v, c.type, fmt)}
                          </td>
                        );
                      })}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
            {totals ? (
              <tfoot className="border-t bg-muted/20">
                <tr>
                  {columns.map((c, i) => {
                    const align = c.align ?? defaultAlign(c.type);
                    const isFirst = i === 0;
                    const totalValue = totals[c.key];
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          "p-3 font-semibold text-sm",
                          align === "right" && "text-right tabular-nums",
                          align === "center" && "text-center",
                          align === "left" && "text-left",
                        )}
                      >
                        {isFirst && totalValue === undefined
                          ? "Total"
                          : totalValue !== undefined
                            ? formatCellForDisplay(totalValue, c.type, fmt)
                            : ""}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            ) : null}
          </table>
        )}

        {footnote ? (
          <div className="px-6 pt-4 pb-6 text-[11px] text-muted-foreground">
            {footnote}
          </div>
        ) : null}
      </Card>
    </ReportShell>
  );
}
