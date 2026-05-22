"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * RPT-AR-DETAILS — Customize Report Columns popover (client).
 *
 * 9 checkboxes for the AR Aging Details columns. Persists via the
 * `cols` searchParam (comma-separated keys). Default = all on (no
 * `cols` param at all → page renders every column).
 */
export const COLUMN_DEFS: Array<{ key: string; label: string }> = [
  { key: "date", label: "Date" },
  { key: "dueDate", label: "Due Date" },
  { key: "number", label: "Transaction#" },
  { key: "type", label: "Type" },
  { key: "status", label: "Status" },
  { key: "customerName", label: "Customer Name" },
  { key: "age", label: "Age" },
  { key: "amount", label: "Amount" },
  { key: "balanceDue", label: "Balance Due" },
];

export const ALL_COLUMN_KEYS = COLUMN_DEFS.map((c) => c.key);

export function CustomizeColumnsPopover({
  selected,
}: {
  selected: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<string[]>(selected);

  React.useEffect(() => {
    setDraft(selected);
  }, [selected.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(key: string) {
    setDraft((prev) =>
      prev.includes(key)
        ? prev.filter((x) => x !== key)
        : [...prev, key]
    );
  }

  function selectAll() {
    setDraft(ALL_COLUMN_KEYS);
  }

  function reset() {
    setDraft(ALL_COLUMN_KEYS);
    const params = new URLSearchParams(searchParams);
    params.delete("cols");
    setOpen(false);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function apply() {
    // Always keep at least one column to avoid an empty table — fall
    // back to all columns if the user unchecked everything.
    const final = draft.length === 0 ? ALL_COLUMN_KEYS : draft;
    // Preserve canonical order from COLUMN_DEFS.
    const ordered = ALL_COLUMN_KEYS.filter((k) => final.includes(k));
    const params = new URLSearchParams(searchParams);
    if (ordered.length === ALL_COLUMN_KEYS.length) {
      params.delete("cols");
    } else {
      params.set("cols", ordered.join(","));
    }
    setOpen(false);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  const selectedCount = selected.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 disabled:opacity-50"
        >
          <Settings2 className="h-3.5 w-3.5" />
          Customize Report Columns{" "}
          <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-muted text-[10px] font-medium">
            {selectedCount}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="end">
        <div className="space-y-0.5">
          <div className="flex items-center justify-between px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Columns</span>
            <button
              type="button"
              onClick={selectAll}
              className="text-primary hover:underline normal-case tracking-normal"
            >
              Select all
            </button>
          </div>
          {COLUMN_DEFS.map((c) => (
            <label
              key={c.key}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-xs"
            >
              <input
                type="checkbox"
                checked={draft.includes(c.key)}
                onChange={() => toggle(c.key)}
                className="h-3.5 w-3.5"
              />
              <span>{c.label}</span>
            </label>
          ))}
          <div className="pt-2 border-t mt-2 flex justify-between items-center">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={reset}
              disabled={pending}
            >
              Reset
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={apply}
              disabled={pending}
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
