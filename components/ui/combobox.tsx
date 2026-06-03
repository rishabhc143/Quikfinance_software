"use client";

import * as React from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { Command } from "cmdk";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  value: string;
  label: string;
  hint?: string;
  /**
   * Optional group label. When ANY option in the list has a non-empty
   * `group`, the dropdown renders with section headers (Zoho-style —
   * see Account picker in the item form). When NO option has a group,
   * the dropdown renders flat, preserving the original UX for every
   * existing caller (Unit, Vendor, list-page filters, etc.).
   */
  group?: string;
};

/**
 * Pure helper: bucket a flat list of options into groups, preserving
 * input order within each group. Exported for unit testing — the
 * Combobox component itself uses this inside a `useMemo`.
 *
 * When NO option has a `group` field, returns a single bucket with
 * empty heading (the caller renders flat). When at least ONE option
 * has a group, every option is assigned to its declared group (empty
 * string for the ungrouped ones) and the bucket order matches the
 * order each group first appeared in the input.
 */
export function groupComboboxOptions(
  options: ComboboxOption[]
): Array<{ heading: string; options: ComboboxOption[] }> {
  const isGrouped = options.some((o) => o.group && o.group.length > 0);
  if (!isGrouped) {
    return [{ heading: "", options }];
  }
  const map = new Map<string, ComboboxOption[]>();
  for (const o of options) {
    const key = o.group ?? "";
    const bucket = map.get(key) ?? [];
    bucket.push(o);
    map.set(key, bucket);
  }
  return Array.from(map.entries()).map(([heading, opts]) => ({
    heading,
    options: opts,
  }));
}

/**
 * Pure helper: filter a flat list of options by a search query (case-
 * insensitive substring match against `label`, `hint`, or `group`).
 * Empty query returns all options unchanged.
 */
export function filterComboboxOptions(
  options: ComboboxOption[],
  search: string
): ComboboxOption[] {
  const q = search.toLowerCase().trim();
  if (!q) return options;
  return options.filter(
    (o) =>
      o.label.toLowerCase().includes(q) ||
      o.hint?.toLowerCase().includes(q) ||
      o.group?.toLowerCase().includes(q)
  );
}

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
  const filtered = React.useMemo(
    () => filterComboboxOptions(options, search),
    [options, search]
  );
  const isGrouped = React.useMemo(
    () => options.some((o) => o.group && o.group.length > 0),
    [options]
  );
  const grouped = React.useMemo(
    () => groupComboboxOptions(filtered),
    [filtered]
  );

  const showCreate =
    allowCreate &&
    search.trim().length > 0 &&
    !options.some((o) => o.label.toLowerCase() === search.trim().toLowerCase());

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
          <ChevronDown
            className={cn(
              "ml-2 h-4 w-4 shrink-0 transition-transform",
              // Zoho convention: chevron rotates 180° + tints primary
              // when the popover is open; sits muted-grey when closed.
              open ? "rotate-180 text-primary" : "opacity-50"
            )}
          />
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
            {grouped.map((g, gi) => (
              <Command.Group
                key={`${g.heading}__${gi}`}
                heading={g.heading || undefined}
                className={cn(
                  isGrouped &&
                    g.heading &&
                    // cmdk renders [cmdk-group-heading] as the heading slot;
                    // styling here matches the Zoho screenshots (small,
                    // bold, dark text padded above each group).
                    "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-foreground"
                )}
              >
                {g.options.map((o) => (
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
                        : cn(
                            "flex items-center gap-2 px-2 py-1.5 aria-selected:bg-primary aria-selected:text-primary-foreground",
                            value === o.value && "bg-primary/10"
                          )
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
                        <span className="flex-1 truncate">{o.label}</span>
                        {o.hint && (
                          <span className="text-xs text-muted-foreground group-aria-selected:text-primary-foreground/80">
                            {o.hint}
                          </span>
                        )}
                        {/* Zoho convention: selected indicator sits on the
                            RIGHT of the row (matches Account dropdown
                            screenshots). Still uses opacity-0/100 so layout
                            is stable whether or not anything is selected. */}
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0",
                            value === o.value ? "opacity-100" : "opacity-0"
                          )}
                        />
                      </>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
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
