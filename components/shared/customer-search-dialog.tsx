"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Magnifier button + dialog that hits /api/sales/customers/search for
 * full-text contact search. Per <quotes_spec>: "Search-magnifier
 * button right of the combobox triggers full-text contact search".
 *
 * The matched row's id is passed back via onSelect — the caller updates
 * the customer combobox state.
 */
export function CustomerSearchDialog({
  onSelect,
}: {
  onSelect: (contact: { id: string; displayName: string }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<
    {
      id: string;
      displayName: string;
      companyName: string | null;
      email: string | null;
      phone: string | null;
    }[]
  >([]);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open || !q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await fetch(
          `/api/sales/customers/search?q=${encodeURIComponent(q)}`
        );
        const data = await res.json();
        setResults(data.results ?? []);
      } finally {
        setBusy(false);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Search customers"
        >
          <Search className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Search customers</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, company, email, phone…"
            autoFocus
          />
          <div className="max-h-80 overflow-y-auto rounded border divide-y">
            {results.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">
                {busy
                  ? "Searching…"
                  : q.trim()
                  ? "No matches."
                  : "Start typing to search."}
              </p>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    onSelect({ id: r.id, displayName: r.displayName });
                    setOpen(false);
                    setQ("");
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
                >
                  <div className="font-medium">{r.displayName}</div>
                  <div className="text-xs text-muted-foreground">
                    {[r.companyName, r.email, r.phone]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
