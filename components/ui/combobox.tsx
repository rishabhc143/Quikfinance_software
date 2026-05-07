"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
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
          <div className="border-b px-3">
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder={placeholder}
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
                className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer aria-selected:bg-accent"
              >
                <Check className={cn("h-4 w-4", value === o.value ? "opacity-100" : "opacity-0")} />
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
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
