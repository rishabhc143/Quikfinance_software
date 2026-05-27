"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus, Search } from "lucide-react";
import { Command } from "cmdk";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label: string; hint?: string };

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  empty = "No matches.",
  allowCreate = false,
  onCreate,
  className,
  disabled,
  testId,
  stackedOptions = false,
}: {
  options: ComboboxOption[];
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  placeholder?: string;
  empty?: string;
  allowCreate?: boolean;
  onCreate?: (input: string) => void | Promise<void>;
  className?: string;
  disabled?: boolean;
  /** M19: optional data-testid on the popover trigger for E2E tests. */
  testId?: string;
  /**
   * Rich option layout (Zoho-style): bold label with its `hint` stacked
   * beneath, checkmark on the right, and a primary-coloured active row.
   * Off by default so existing single-line comboboxes are unaffected.
   */
  stackedOptions?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q));
  }, [options, search]);
  const showCreate = allowCreate && search.trim().length > 0 && !options.some((o) => o.label.toLowerCase() === search.trim().toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          disabled={disabled}
          data-testid={testId}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command shouldFilter={false}>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Search"
              className="flex h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-60 overflow-y-auto p-1">
            {filtered.length === 0 && !showCreate && (
              <Command.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">{empty}</Command.Empty>
            )}
            {filtered.map((o) => (
              <Command.Item
                key={o.value}
                value={o.value}
                onSelect={() => {
                  onChange(o.value === value ? null : o.value);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "group cursor-pointer rounded text-sm",
                  stackedOptions
                    ? cn(
                        "flex items-start gap-2 px-3 py-2 aria-selected:bg-primary aria-selected:text-primary-foreground",
                        value === o.value && "bg-muted"
                      )
                    : "flex items-center gap-2 px-2 py-1.5 aria-selected:bg-accent"
                )}
              >
                {stackedOptions ? (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{o.label}</div>
                      {o.hint && (
                        <div className="text-xs text-muted-foreground group-aria-selected:text-primary-foreground/90">
                          {o.hint}
                        </div>
                      )}
                    </div>
                    <Check
                      className={cn(
                        "mt-0.5 h-4 w-4 shrink-0",
                        value === o.value ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </>
                ) : (
                  <>
                    <Check className={cn("h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
                  </>
                )}
              </Command.Item>
            ))}
            {showCreate && (
              <Command.Item
                value={`__create__${search}`}
                onSelect={async () => {
                  await onCreate?.(search.trim());
                  setOpen(false);
                  setSearch("");
                }}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer aria-selected:bg-accent border-t mt-1 pt-2"
              >
                <Plus className="h-4 w-4" />
                <span>Add &ldquo;{search.trim()}&rdquo;</span>
              </Command.Item>
            )}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
