"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * RPT-AR-DETAILS — Entities multi-select (client). Lets the user
 * include Invoices and/or Credit Notes in the report. Submits when
 * the popover closes.
 */
const OPTIONS: Array<{ value: string; label: string }> = [
  { value: "invoice", label: "Invoice" },
  { value: "creditnote", label: "Credit Note" },
];

export function EntitiesPopover({ entities }: { entities: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<string[]>(entities);

  React.useEffect(() => {
    setDraft(entities);
  }, [entities.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle(value: string) {
    setDraft((prev) =>
      prev.includes(value)
        ? prev.filter((x) => x !== value)
        : [...prev, value]
    );
  }

  function apply() {
    const params = new URLSearchParams(searchParams);
    if (draft.length === 0 || (draft.length === 1 && draft[0] === "invoice")) {
      params.delete("entities"); // default omitted from URL
    } else {
      params.set("entities", draft.join(","));
    }
    setOpen(false);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  const label =
    entities.length === 0
      ? "None"
      : entities.length === 1
      ? labelOf(entities[0])
      : `${entities.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs font-normal gap-1.5"
          disabled={pending}
        >
          <span className="text-muted-foreground">Entities:</span>
          <span>{label}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-2" align="start">
        <div className="space-y-1">
          {OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/50 cursor-pointer text-xs"
            >
              <input
                type="checkbox"
                checked={draft.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="h-3.5 w-3.5"
              />
              <span>{o.label}</span>
            </label>
          ))}
          <div className="pt-2 border-t mt-2 flex justify-end">
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

function labelOf(v: string) {
  if (v === "invoice") return "Invoice";
  if (v === "creditnote") return "Credit Note";
  return v;
}
