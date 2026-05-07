"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowUp, ArrowDown, ArrowUpDown, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { ColumnDef, DataRow } from "@/components/shared/data-table";

/**
 * Bulk-aware data table — generalization of the M14 customers-table.
 * Same DataTable shape (URL-state-driven search/sort/pagination) plus a
 * checkbox column and a sticky bulk-actions bar at the top.
 *
 * Per <acceptance_criteria> #10: every Sales list page must support row
 * checkbox selection + at least Bulk Delete. Each module passes the
 * actions it specifically supports (Mark as Sent, Send Reminder, etc.)
 * via the `bulkActions` array.
 *
 * Each action receives the array of selected row IDs and returns
 * `{ ok, updated?, error? }`. The toast + `router.refresh()` happen here.
 */
export type BulkAction = {
  /** Button label, e.g. "Mark as Sent". */
  label: string;
  /** Verb used in success toast: "Marked 3 quotes as sent". */
  doneVerb?: string;
  /** Singular noun for toast: "quote". Defaults to "row". */
  noun?: string;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
  /** Show a confirm() prompt before invoking. Useful for destructive actions. */
  confirm?: string;
  /**
   * Server action that performs the bulk operation. Mutually exclusive
   * with `href`.
   */
  action?: (
    ids: string[]
  ) => Promise<{ ok: boolean; updated?: number; error?: string }>;
  /**
   * Builds a URL to navigate to (typically a route handler that streams a
   * zip or CSV). When set, the button opens the URL in a new tab — used
   * for Bulk Print (zip of PDFs) and Bulk Export Selected (CSV).
   */
  href?: (ids: string[]) => string;
};

export function BulkAwareDataTable({
  rows,
  columns,
  total,
  page,
  pageSize,
  sort,
  dir,
  search,
  bulkActions,
  rowNoun,
}: {
  rows: DataRow[];
  columns: ColumnDef[];
  total: number;
  page: number;
  pageSize: number;
  sort?: string;
  dir?: "asc" | "desc";
  search?: string;
  bulkActions: BulkAction[];
  /** Singular noun for the row counter, e.g. "quote". Defaults to "row". */
  rowNoun?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [searchValue, setSearchValue] = React.useState(search ?? "");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSearchValue(search ?? "");
  }, [search]);

  React.useEffect(() => {
    if (searchValue === (search ?? "")) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      if (searchValue) next.set("q", searchValue);
      else next.delete("q");
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    }, 300);
    return () => clearTimeout(t);
  }, [searchValue]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (prev.size === rows.length) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }

  function setSort(field: string) {
    const next = new URLSearchParams(sp.toString());
    next.set("sort", field);
    next.set("dir", sort === field && dir === "asc" ? "desc" : "asc");
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  function setPage(p: number) {
    const next = new URLSearchParams(sp.toString());
    next.set("page", String(p));
    router.push(`${pathname}?${next.toString()}`);
  }

  function setPageSize(s: number) {
    const next = new URLSearchParams(sp.toString());
    next.set("pageSize", String(s));
    next.delete("page");
    router.push(`${pathname}?${next.toString()}`);
  }

  async function runAction(action: BulkAction) {
    if (action.confirm && !window.confirm(action.confirm)) return;
    const ids = Array.from(selected);

    // href-mode: navigate to a download URL (zip / csv) and clear selection
    if (action.href) {
      const url = action.href(ids);
      window.open(url, "_blank", "noopener");
      setSelected(new Set());
      return;
    }

    if (!action.action) return;
    setBusy(action.label);
    try {
      const r = await action.action(ids);
      if (!r.ok) {
        toast.error(r.error ?? `${action.label} failed`);
        return;
      }
      const n = r.updated ?? ids.length;
      const noun = action.noun ?? rowNoun ?? "row";
      const verb = action.doneVerb ?? action.label.toLowerCase();
      toast.success(`${verb} ${n} ${noun}${n === 1 ? "" : "s"}`);
      setSelected(new Set());
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `${action.label} failed`);
    } finally {
      setBusy(null);
    }
  }

  const noun = rowNoun ?? "row";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative max-w-xs">
          <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder="Search…"
            className="pl-8"
          />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          {total.toLocaleString()} {total === 1 ? noun : `${noun}s`}
        </span>
      </div>

      {selected.size > 0 ? (
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-md border bg-card p-2 shadow-sm">
          <span className="text-sm">
            <strong>{selected.size}</strong> selected
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {bulkActions.map((a) => (
              <Button
                key={a.label}
                size="sm"
                variant={a.variant ?? "outline"}
                disabled={busy !== null}
                onClick={() => runAction(a)}
                className="gap-1"
              >
                {busy === a.label ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                {a.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
              disabled={busy !== null}
            >
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-md border bg-background overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3 w-8">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={rows.length > 0 && selected.size === rows.length}
                  ref={(el) => {
                    if (el)
                      el.indeterminate =
                        selected.size > 0 && selected.size < rows.length;
                  }}
                  onChange={toggleAll}
                />
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`p-3 ${
                    c.align === "right"
                      ? "text-right"
                      : c.align === "center"
                      ? "text-center"
                      : "text-left"
                  } ${c.className ?? ""}`}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => setSort(c.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                    >
                      {c.header}
                      {sort !== c.key ? (
                        <ArrowUpDown className="h-3 w-3" />
                      ) : dir === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="p-8 text-center text-sm text-muted-foreground"
                >
                  No rows match.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/30">
                <td className="p-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${row.id}`}
                    checked={selected.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                  />
                </td>
                {row.cells.map((cell, i) => {
                  const c = columns[i];
                  const isFirst = i === 0;
                  return (
                    <td
                      key={c?.key ?? i}
                      className={`p-3 ${
                        c?.align === "right"
                          ? "text-right"
                          : c?.align === "center"
                          ? "text-center"
                          : ""
                      } ${c?.className ?? ""}`}
                    >
                      {isFirst && row.href ? (
                        <Link href={row.href} className="hover:underline">
                          {cell}
                        </Link>
                      ) : (
                        cell
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <label htmlFor="rows-per-page" className="text-muted-foreground">
            Rows per page
          </label>
          <select
            id="rows-per-page"
            aria-label="Rows per page"
            className="h-8 rounded border px-2 text-sm bg-background"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
