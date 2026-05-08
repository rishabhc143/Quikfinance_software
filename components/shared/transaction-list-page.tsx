import * as React from "react";
import Link from "next/link";
import { Plus, MoreHorizontal, ChevronDown } from "lucide-react";
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
import { SavedViewListItem } from "@/components/shared/saved-view-list-item";

/**
 * Shared list-page primitive for every Sales sub-module.
 *
 * Each sub-module's page.tsx is now a thin server component that fetches
 * the rows and hands them here. DataTable handles search + pagination
 * (URL-state-driven), this wrapper handles the heading, primary CTA,
 * three-dots menu, saved views, and empty state.
 */

/**
 * M34: `id` + `isSystem` are optional so existing call-sites that
 * only pass `value`+`label` still compile. When `id` is present and
 * `isSystem === false`, the chevron-dropdown row gets a trailing X
 * delete button.
 */
export type SavedView = {
  value: string;
  label: string;
  id?: string;
  isSystem?: boolean;
};

export type TransactionListPageProps = {
  title: string;
  /** Subtitle line under the heading (e.g. "Showing all customers"). */
  view?: string;
  /** Saved views — when present the heading becomes a clickable dropdown
   *  that links to `?view=<value>`. The first entry should be "all". */
  views?: SavedView[];
  /** Currently active saved view value (matches one of `views.value`). */
  activeView?: string;
  newHref?: string;
  newLabel?: string;
  importHref?: string;
  /** M17f: alternative to `importHref` — multiple import targets, rendered
   *  as separate three-dots items (e.g. Invoices: "Import Invoices" +
   *  "Import Debit Notes"). When supplied, replaces the single Import row. */
  importMenuItems?: { label: string; href: string }[];
  /** Base URL for the export route handler. Two menu entries are added:
   *  Export All (mode=all) and Export Current View (mode=current_view). */
  exportHref?: string;
  /** M27: optional rich Export dialog — when supplied, replaces the simple
   *  Export All / Export Current View links with a single Export… item that
   *  opens the dialog (with Status + Date Range + format + decimal +
   *  PII + password options). */
  exportDialog?: React.ReactNode;
  /** M31: optional "+ New Custom View" trigger appended to the chevron-
   *  dropdown after the system + user saved views. Caller passes a fully-
   *  configured <SavedViewBuilderDialog> (the dialog provides its own
   *  trigger). */
  savedViewBuilder?: React.ReactNode;
  preferencesHref?: string;
  /** M17c — link to the Manage Custom Fields editor for this entity. */
  customFieldsHref?: string;
  /** M17b — direct link to Online Payments settings (Invoices three-dots). */
  onlinePaymentsHref?: string;
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
  /** Optional override to render a custom table component instead of the
   *  default <DataTable>. Used by Customer list to inject row-checkbox
   *  bulk-selection. The columns/rows props above are still passed to
   *  the wrapper so it can supply them to the custom component. */
  customTable?: React.ReactNode;
};

export function TransactionListPage(props: TransactionListPageProps) {
  const isEmpty = props.rows.length === 0 && !props.search;
  const hasViews = props.views && props.views.length > 0;
  const activeViewLabel =
    hasViews && props.activeView
      ? props.views!.find((v) => v.value === props.activeView)?.label
      : undefined;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          {hasViews ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-2xl font-semibold tracking-tight hover:text-foreground/80"
                  aria-label="Select saved view"
                >
                  <span>{props.title}</span>
                  <ChevronDown className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Saved views</DropdownMenuLabel>
                {props.views!.map((v) => (
                  <SavedViewListItem
                    key={v.value}
                    id={v.id}
                    value={v.value}
                    label={v.label}
                    isActive={v.value === props.activeView}
                    isSystem={v.isSystem ?? true}
                  />
                ))}
                {props.savedViewBuilder ? (
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className="p-0"
                    asChild
                  >
                    <div>{props.savedViewBuilder}</div>
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
          )}
          {props.view || activeViewLabel ? (
            <div className="text-xs text-muted-foreground">
              {activeViewLabel ?? props.view}
            </div>
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
              {props.importMenuItems && props.importMenuItems.length > 0 ? (
                props.importMenuItems.map((it) => (
                  <DropdownMenuItem key={it.href} asChild>
                    <Link href={it.href}>{it.label}</Link>
                  </DropdownMenuItem>
                ))
              ) : props.importHref ? (
                <DropdownMenuItem asChild>
                  <Link href={props.importHref}>Import</Link>
                </DropdownMenuItem>
              ) : null}
              {props.exportDialog ? (
                <DropdownMenuItem
                  onSelect={(e) => e.preventDefault()}
                  className="p-0"
                  asChild
                >
                  {/* The dialog's <DialogTrigger asChild> handles the
                       click; we just provide the menu row. */}
                  <div>{props.exportDialog}</div>
                </DropdownMenuItem>
              ) : props.exportHref ? (
                <>
                  <DropdownMenuItem asChild>
                    <a href={`${props.exportHref}?mode=all`}>Export all</a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={`${props.exportHref}?mode=current_view`}>
                      Export current view
                    </a>
                  </DropdownMenuItem>
                </>
              ) : null}
              {props.preferencesHref ? (
                <DropdownMenuItem asChild>
                  <Link href={props.preferencesHref}>Preferences</Link>
                </DropdownMenuItem>
              ) : null}
              {props.customFieldsHref ? (
                <DropdownMenuItem asChild>
                  <Link href={props.customFieldsHref}>Manage Custom Fields</Link>
                </DropdownMenuItem>
              ) : null}
              {props.onlinePaymentsHref ? (
                <DropdownMenuItem asChild>
                  <Link href={props.onlinePaymentsHref}>Online Payments</Link>
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {isEmpty ? (
        <div className="rounded-lg border bg-card p-10 text-center">{props.empty}</div>
      ) : props.customTable ? (
        props.customTable
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
