"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { BulkActionsBar } from "./bulk-actions-bar";

export type CustomerRow = {
  id: string;
  href: string;
  cells: React.ReactNode[];
};

export type CustomerColumn = {
  key: string;
  header: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
};

/**
 * Customer-list table with row-checkbox bulk selection. Replaces the
 * shared <DataTable> for this list because bulk actions need a client
 * component holding the selection set. Per <customers_spec> Bulk
 * actions: Mark Active / Mark Inactive (Delete + Email shipped via
 * per-row dialogs to keep the safety guards).
 */
export function CustomersTable({
  rows,
  columns,
  total,
  page,
  pageSize,
  sort,
  dir,
  search,
  bulkSetActive,
}: {
  rows: CustomerRow[];
  columns: CustomerColumn[];
  total: number;
  page: number;
  pageSize: number;
  sort?: string;
  dir?: "asc" | "desc";
  search?: string;
  bulkSetActive: (input: {
    ids: string[];
    isInactive: boolean;
  }) => Promise<{ updated: number }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [searchValue, setSearchValue] = React.useState(search ?? "");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

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
          {total.toLocaleString()} {total === 1 ? "customer" : "customers"}
        </span>
      </div>

      <BulkActionsBar
        selectedIds={Array.from(selected)}
        onClear={() => setSelected(new Set())}
        bulkSetActive={bulkSetActive}
      />

      <div className="rounded-md border bg-background overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th scope="col" className="p-3 w-8">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={
                    rows.length > 0 && selected.size === rows.length
                  }
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
                  scope="col"
                  className={`p-3 ${
                    c.align === "right"
                      ? "text-right"
                      : c.align === "center"
                      ? "text-center"
                      : "text-left"
                  }`}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      onClick={() => setSort(c.key)}
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      aria-label={`Sort by ${c.header}`}
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
                      }`}
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
