import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * REPORTS-INFRA — Page wrapper used by every report under
 * `/reports/<slug>`. Centralises the "Back arrow + title +
 * date filter strip + Export buttons" boilerplate so individual
 * report files focus on their data + table.
 *
 * Server-renderable. No state lives here — the date picker and
 * export buttons are passed in as ReactNode slots so the report
 * page wires its own actions.
 *
 *   <ReportShell
 *     title="Profit and Loss"
 *     subtitle="Cash + accrual basis · auto-pulled from journal entries"
 *     backHref="/reports"
 *     range={<DateRangePicker ... />}
 *     actions={<>
 *       <Button asChild variant="outline" size="sm">
 *         <a href="/reports/profit-loss/export?format=csv">Export CSV</a>
 *       </Button>
 *     </>}
 *   >
 *     ...the report's tables + summary cards...
 *   </ReportShell>
 */
export function ReportShell({
  title,
  subtitle,
  backHref = "/reports",
  range,
  actions,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  backHref?: string;
  /** Date-range picker (or any other primary filter) for this report. */
  range?: React.ReactNode;
  /** Right-aligned action buttons — typically Export CSV / XLSX. */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-2 min-w-0">
          <Button asChild variant="ghost" size="icon" aria-label="Back">
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight">{title}</h1>
            {subtitle ? (
              <div className="text-sm text-muted-foreground mt-0.5">
                {subtitle}
              </div>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        ) : null}
      </div>

      {range ? (
        <div className="flex items-center gap-3 pb-1">{range}</div>
      ) : null}

      {children}
    </div>
  );
}
