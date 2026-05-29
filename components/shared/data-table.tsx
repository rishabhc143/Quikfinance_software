"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowUp, ArrowDown, ArrowUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type ColumnDef = {
  key: string;
  header: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
};

export type RowStatusVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral";

export type DataRow = {
  id: string;
  href?: string;
  cells: React.ReactNode[];
  /** When set, draws a 2px colored strip on the left edge of the row —
   *  scan cue for Paid/Overdue/Draft/etc. without reading the status
   *  text. Wire up per-list-page by mapping each row's status enum to
   *  one of the five variants. */
  statusVariant?: RowStatusVariant;
};

const ROW_STRIP_CLASS: Record<RowStatusVariant, string> = {
  success: "border-l-2 border-success",
  warning: "border-l-2 border-warning",
  danger: "border-l-2 border-destructive",
  info: "border-l-2 border-info",
  neutral: "border-l-2 border-muted-foreground/30",
};

export function DataTable({
  rows, columns, total, page, pageSize, sort, dir, search,
}: {
  rows: DataRow[];
  columns: ColumnDef[];
  total: number;
  page: number;
  pageSize: number;
  sort?: string;
  dir?: "asc" | "desc";
  search?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [searchValue, setSearchValue] = React.useState(search ?? "");
  React.useEffect(() => { setSearchValue(search ?? ""); }, [search]);
  React.useEffect(() => {
    if (searchValue === (search ?? "")) return;
    const t = setTimeout(() => {
      const next = new URLSearchParams(sp.toString());
      if (searchValue) next.set("q", searchValue); else next.delete("q");
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    }, 300);
    return () => clearTimeout(t);
  }, [searchValue]); // eslint-disable-line react-hooks/exhaustive-deps

  function setSort(field: string) {
    const next = new URLSearchParams(sp.toString());
    const isCurrent = sort === field;
    next.set("sort", field);
    next.set("dir", isCurrent && dir === "asc" ? "desc" : "asc");
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
          <Input value={searchValue} onChange={(e) => setSearchValue(e.target.value)} placeholder="Search…" className="pl-8" />
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{total.toLocaleString()} {total === 1 ? "row" : "rows"}</span>
      </div>

      <div className="rounded-md border bg-background overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={`p-3 ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : "text-left"} ${c.className ?? ""}`}>
                  {c.sortable ? (
                    <button type="button" onClick={() => setSort(c.key)} className="inline-flex items-center gap-1 hover:text-foreground" aria-label={`Sort by ${c.header}`}>
                      {c.header}
                      {sort !== c.key ? <ArrowUpDown className="h-3 w-3" /> : dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr><td colSpan={columns.length} className="p-8 text-center text-sm text-muted-foreground">No rows match.</td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/30 transition-colors">
                {row.cells.map((cell, i) => {
                  const c = columns[i];
                  const isFirst = i === 0;
                  // Tabular nums on right-aligned columns — keeps money
                  // columns visually aligned across rows.
                  const isRight = c?.align === "right";
                  return (
                    <td
                      key={c?.key ?? i}
                      className={`p-3 ${isRight ? "text-right tabular-nums" : c?.align === "center" ? "text-center" : ""} ${isFirst && row.statusVariant ? ROW_STRIP_CLASS[row.statusVariant] : ""} ${c?.className ?? ""}`}
                    >
                      {isFirst && row.href ? <Link href={row.href} className="hover:underline">{cell}</Link> : cell}
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
          <label htmlFor="rows-per-page" className="text-muted-foreground">Rows per page</label>
          <select id="rows-per-page" aria-label="Rows per page" className="h-8 rounded border px-2 text-sm bg-background" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
            {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}

export function PageHeader({
  title, ctaHref, ctaLabel, children,
}: { title: string; ctaHref?: string; ctaLabel?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 flex-wrap">
      <h1 className="text-xl font-semibold">{title}</h1>
      <div className="flex items-center gap-2">
        {children}
        {ctaHref && ctaLabel && (
          <Button asChild><Link href={ctaHref}>{ctaLabel}</Link></Button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  title, description, ctaHref, ctaLabel,
}: { title: string; description: string; ctaHref?: string; ctaLabel?: string }) {
  return (
    <div className="rounded-lg border bg-background p-12 text-center space-y-3">
      <h2 className="text-base font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground max-w-md mx-auto">{description}</p>
      {ctaHref && ctaLabel && (
        <Button asChild className="mt-2"><Link href={ctaHref}>{ctaLabel}</Link></Button>
      )}
    </div>
  );
}
