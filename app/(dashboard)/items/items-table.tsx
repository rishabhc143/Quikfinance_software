"use client";

import * as React from "react";
import Link from "next/link";
import { Search, ArrowUpDown, ArrowUp, ArrowDown, Plus } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useQueryStates, parseAsInteger, parseAsString } from "nuqs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import { softDeleteItemsAction, setItemsActiveAction } from "./actions";
import { toast } from "sonner";

type Row = {
  id: string;
  name: string;
  sku: string | null;
  purchaseDescription: string | null;
  purchaseRate: number | null;
  salesDescription: string | null;
  sellingPrice: number | null;
  unit: string | null;
  isActive: boolean;
};

type Props = {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  dir: "asc" | "desc";
  currency: string;
  emptyState: boolean;
};

export function ItemsTable({ rows, total, page, pageSize, sort, dir, currency, emptyState }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [queries, setQueries] = useQueryStates({
    q: parseAsString.withDefault(""),
    page: parseAsInteger.withDefault(1),
    pageSize: parseAsInteger.withDefault(25),
    sort: parseAsString.withDefault("name"),
    dir: parseAsString.withDefault("asc"),
  });

  const [searchOpen, setSearchOpen] = React.useState(queries.q.length > 0);
  const [search, setSearch] = React.useState(queries.q);

  React.useEffect(() => {
    const t = setTimeout(() => {
      if (search !== queries.q) setQueries({ q: search, page: 1 });
    }, 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelected((s) => (s.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function setSort(field: string) {
    const next = sort === field ? (dir === "asc" ? "desc" : "asc") : "asc";
    setQueries({ sort: field, dir: next, page: 1 });
  }

  async function bulk(action: "delete" | "activate" | "deactivate") {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const verb = action === "delete" ? "Delete" : action === "activate" ? "Mark active" : "Mark inactive";
    if (!confirm(`${verb} ${ids.length} item${ids.length === 1 ? "" : "s"}?`)) return;
    if (action === "delete") {
      const r = await softDeleteItemsAction(ids);
      if (r.ok) { toast.success(`Deleted ${r.count} items`); setSelected(new Set()); router.refresh(); }
    } else {
      const r = await setItemsActiveAction(ids, action === "activate");
      if (r.ok) { toast.success(`${verb} ${r.count} items`); setSelected(new Set()); router.refresh(); }
    }
  }

  function statusFilter(value: "all" | "active" | "inactive") {
    const sp = new URLSearchParams(searchParams.toString());
    if (value === "all") sp.delete("status");
    else sp.set("status", value);
    sp.delete("page");
    router.push(`${pathname}?${sp.toString()}`);
  }

  if (emptyState) {
    return (
      <div className="rounded-lg border bg-background p-16 text-center space-y-4">
        <div className="mx-auto h-16 w-16 rounded-full bg-muted grid place-items-center text-3xl">📦</div>
        <h2 className="text-lg font-medium">Goods and Services, if they have a price tag, put them here.</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">Items power your invoices, bills, quotes, and inventory. Add your first one to get started.</p>
        <Button asChild><Link href="/items/new"><Plus className="h-4 w-4 mr-1" /> New Item</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-muted rounded-md p-1">
          {([
            ["all", "All"], ["active", "Active"], ["inactive", "Inactive"],
          ] as const).map(([k, label]) => {
            const active = (searchParams.get("status") ?? "all") === k;
            return (
              <button
                key={k}
                onClick={() => statusFilter(k)}
                className={`px-3 py-1 text-xs rounded ${active ? "bg-background shadow-sm font-medium" : "text-foreground/70 hover:text-foreground"}`}
              >{label}</button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {searchOpen ? (
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search items…"
              className="w-64"
              onBlur={() => { if (!search) setSearchOpen(false); }}
            />
          ) : (
            <Button variant="outline" size="icon" onClick={() => setSearchOpen(true)} aria-label="Search">
              <Search className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="rounded-md border bg-primary/5 px-3 py-2 flex items-center gap-3 text-sm">
          <span><strong>{selected.size}</strong> selected</span>
          <Button size="sm" variant="outline" onClick={() => bulk("activate")}>Mark Active</Button>
          <Button size="sm" variant="outline" onClick={() => bulk("deactivate")}>Mark Inactive</Button>
          <Button size="sm" variant="destructive" onClick={() => bulk("delete")}>Delete</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">Clear</Button>
        </div>
      )}

      <div className="rounded-md border bg-background overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="w-10 p-3">
                <input
                  type="checkbox"
                  checked={selected.size > 0 && selected.size === rows.length}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <SortHeader label="Name" field="name" sort={sort} dir={dir} onClick={setSort} />
              <th className="text-left p-3">Purchase Description</th>
              <SortHeader label="Purchase Rate" field="costPrice" sort={sort} dir={dir} onClick={setSort} className="text-right" />
              <th className="text-left p-3">Description</th>
              <SortHeader label="Rate" field="sellingPrice" sort={sort} dir={dir} onClick={setSort} className="text-right" />
              <th className="text-left p-3">Usage Unit</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No items match.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="p-3">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} />
                </td>
                <td className="p-3">
                  <Link href={`/items/${r.id}`} className="font-medium hover:underline">
                    {r.name} {!r.isActive && <span className="ml-1 text-[10px] text-muted-foreground">(inactive)</span>}
                  </Link>
                </td>
                <td className="p-3 text-muted-foreground truncate max-w-[200px]">{r.purchaseDescription ?? "—"}</td>
                <td className="p-3 text-right tabular-nums">{r.purchaseRate !== null ? formatMoney(r.purchaseRate, currency) : "—"}</td>
                <td className="p-3 text-muted-foreground truncate max-w-[200px]">{r.salesDescription ?? "—"}</td>
                <td className="p-3 text-right tabular-nums">{r.sellingPrice !== null ? formatMoney(r.sellingPrice, currency) : "—"}</td>
                <td className="p-3 text-muted-foreground">{r.unit ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <label htmlFor="items-page-size" className="text-muted-foreground">Rows per page</label>
          <select
            id="items-page-size"
            aria-label="Rows per page"
            className="h-8 rounded border px-2 text-sm bg-background"
            value={pageSize}
            onChange={(e) => setQueries({ pageSize: Number(e.target.value), page: 1 })}
          >
            {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setQueries({ page: page - 1 })}>Prev</Button>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setQueries({ page: page + 1 })}>Next</Button>
        </div>
      </div>
    </div>
  );
}

function SortHeader({ label, field, sort, dir, onClick, className = "" }: { label: string; field: string; sort: string; dir: string; onClick: (f: string) => void; className?: string }) {
  const Icon = sort !== field ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={`p-3 text-left ${className}`}>
      <button onClick={() => onClick(field)} className="inline-flex items-center gap-1 hover:text-foreground">
        {label} <Icon className="h-3 w-3" />
      </button>
    </th>
  );
}
