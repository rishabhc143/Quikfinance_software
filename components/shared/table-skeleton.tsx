import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Skeleton placeholder that matches the shape of `<DataTable>` — used by
 * `loading.tsx` Suspense fallbacks on list pages so users see structure
 * instead of a blank page while the server is fetching rows.
 *
 *   // app/(dashboard)/sales/invoices/loading.tsx
 *   import { TableSkeleton } from "@/components/shared/table-skeleton";
 *   export default function Loading() {
 *     return <TableSkeleton columnCount={6} rowCount={10} title="Invoices" />;
 *   }
 *
 * Mirrors the DataTable's search-bar + table-shell + pagination chrome
 * so the layout doesn't shift when the real content lands.
 */
export function TableSkeleton({
  columnCount = 5,
  rowCount = 8,
  title,
  className,
}: {
  columnCount?: number;
  rowCount?: number;
  /** Optional page title to render above the table (mirrors PageHeader). */
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {title ? (
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="text-xl font-semibold">{title}</h1>
        </div>
      ) : null}

      {/* Search bar shell */}
      <div className="flex items-center gap-2">
        <div className="h-9 w-64 max-w-xs rounded-md bg-muted animate-pulse" />
        <span className="ml-auto h-3 w-16 rounded bg-muted animate-pulse" />
      </div>

      {/* Table shell */}
      <div className="rounded-md border bg-background overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {Array.from({ length: columnCount }).map((_, i) => (
                <th key={i} className="p-3 text-left">
                  <span className="inline-block h-3 w-20 rounded bg-muted-foreground/20 animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {Array.from({ length: rowCount }).map((_, r) => (
              <tr key={r}>
                {Array.from({ length: columnCount }).map((_, c) => (
                  <td key={c} className="p-3">
                    <span
                      className="inline-block h-3 rounded bg-muted animate-pulse"
                      style={{
                        // Vary widths column-by-column so it looks like
                        // real data, not a comb.
                        width:
                          c === 0
                            ? "60%"
                            : c === columnCount - 1
                              ? "40%"
                              : `${50 + ((r + c) % 4) * 10}%`,
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination shell */}
      <div className="flex items-center justify-between text-sm">
        <div className="h-8 w-24 rounded bg-muted animate-pulse" />
        <div className="flex items-center gap-2">
          <span className="h-3 w-20 rounded bg-muted animate-pulse" />
          <div className="h-8 w-16 rounded bg-muted animate-pulse" />
          <div className="h-8 w-16 rounded bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  );
}
