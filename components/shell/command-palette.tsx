"use client";

import * as React from "react";
import { Command } from "cmdk";
import { Search, FileText, Package, Users, Receipt } from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

type SearchResult = {
  group: "items" | "contacts" | "invoices" | "bills";
  id: string;
  label: string;
  href: string;
};

export function CommandPaletteTrigger() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (e.key === "/" && !target?.closest("input, textarea, [contenteditable]")) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    if (!open || query.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (r.ok) setResults(await r.json());
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [open, query]);

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.group] ??= []).push(r);
    return acc;
  }, {});

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 w-72 px-3 py-1.5 text-sm text-muted-foreground bg-muted/50 border rounded-md hover:bg-muted"
      >
        <Search className="h-4 w-4" /> Search…
        <kbd className="ml-auto text-[10px] bg-background border rounded px-1.5 py-0.5">/</kbd>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 max-w-2xl">
          <DialogTitle className="sr-only">Search</DialogTitle>
          <Command shouldFilter={false} className="rounded-lg">
            <div className="flex items-center border-b px-3">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search items, contacts, invoices, bills…"
                className="flex h-12 w-full bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
            <Command.List className="max-h-80 overflow-y-auto p-2">
              {loading && <div className="px-2 py-4 text-sm text-muted-foreground">Searching…</div>}
              {!loading && query.length >= 2 && results.length === 0 && (
                <Command.Empty className="px-2 py-4 text-sm text-muted-foreground">No results.</Command.Empty>
              )}
              {Object.entries(grouped).map(([group, items]) => (
                <Command.Group key={group} heading={group.toUpperCase()} className="text-xs text-muted-foreground">
                  {items.map((it) => (
                    <Command.Item
                      key={it.id}
                      value={it.id}
                      onSelect={() => { router.push(it.href); setOpen(false); }}
                      className="flex items-center gap-2 px-2 py-2 rounded text-sm cursor-pointer aria-selected:bg-accent"
                    >
                      <Icon group={it.group} />
                      {it.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Icon({ group }: { group: SearchResult["group"] }) {
  if (group === "items") return <Package className="h-4 w-4 text-muted-foreground" />;
  if (group === "contacts") return <Users className="h-4 w-4 text-muted-foreground" />;
  if (group === "invoices") return <FileText className="h-4 w-4 text-muted-foreground" />;
  return <Receipt className="h-4 w-4 text-muted-foreground" />;
}
