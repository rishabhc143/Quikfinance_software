import * as React from "react";
import Link from "next/link";
import { Plus, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type ColumnDef, type DataRow } from "@/components/shared/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Shared list-page primitive for every Sales sub-module.
 *
 * Each sub-module's page.tsx is now a thin server component that fetches
 * the rows and hands them here. DataTable handles search + pagination
 * (URL-state-driven), this wrapper handles the heading, primary CTA,
 * three-dots menu, and empty state.
 */
export type TransactionListPageProps = {
  title: string;
  /** Optional saved-views chevron — Phase S8 wires the dropdown; v1 just renders the label. */
  view?: string;
  newHref?: string;
  newLabel?: string;
  importHref?: string;
  preferencesHref?: string;
  /** Three-dots Sort By options. Each emits a query param ?sort= when clicked. */
  sortOptions?: { label: string; value: string }[];
  columns: ColumnDef[];
  rows: DataRow[];
  total: number;
  page: number;
  pageSize: number;
  sort?: string;
  dir?: "asc" | "desc";
  search?: string;
  empty: React.ReactNode;
};

export function TransactionListPage(props: TransactionListPageProps) {
  const isEmpty = props.rows.length === 0 && !props.search;
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
          {props.view ? (
            <div className="text-xs text-muted-foreground">{props.view}</div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {props.newHref ? (
            <Button asChild size="sm" className="gap-1">
              <Link href={props.newHref}>
                <Plus className="h-4 w-4" /> {props.newLabel ?? "New"}
              </Link>
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {props.sortOptions && props.sortOptions.length > 0 ? (
                <>
                  <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                  {props.sortOptions.map((s) => (
                    <DropdownMenuItem key={s.value} asChild>
                      <Link href={`?sort=${encodeURIComponent(s.value)}`}>{s.label}</Link>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              ) : null}
              {props.importHref ? (
                <DropdownMenuItem asChild>
                  <Link href={props.importHref}>Import</Link>
                </DropdownMenuItem>
              ) : null}
              {props.preferencesHref ? (
                <DropdownMenuItem asChild>
                  <Link href={props.preferencesHref}>Preferences</Link>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {isEmpty ? (
        <div className="rounded-lg border bg-card p-10 text-center">{props.empty}</div>
      ) : (
        <DataTable
          columns={props.columns}
          rows={props.rows}
          total={props.total}
          page={props.page}
          pageSize={props.pageSize}
          sort={props.sort}
          dir={props.dir}
          search={props.search}
        />
      )}
    </div>
  );
}
