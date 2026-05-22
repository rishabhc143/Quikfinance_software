"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Plus, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/**
 * RPT-AR-DETAILS — More Filters popover (client).
 *
 * Holds the secondary filters that don't fit in the always-visible
 * chip row: Status / Customer / Amount range / Bucket. Apply pushes
 * a new URL preserving the primary filters (As of, Aging By, etc.).
 */
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "SENT", label: "Sent" },
  { value: "PARTIALLY_PAID", label: "Partially Paid" },
  { value: "OVERDUE", label: "Overdue" },
];

export function MoreFiltersPopover({
  statuses,
  customerId,
  customerName,
  amountMin,
  amountMax,
  buckets,
  bucketOptions,
  customerOptions,
}: {
  statuses: string[];
  customerId: string;
  customerName: string;
  amountMin: string;
  amountMax: string;
  buckets: string[];
  bucketOptions: string[];
  customerOptions: Array<{ id: string; displayName: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);

  const [draftStatuses, setDraftStatuses] = React.useState(statuses);
  const [draftCustomerId, setDraftCustomerId] = React.useState(customerId);
  const [draftMin, setDraftMin] = React.useState(amountMin);
  const [draftMax, setDraftMax] = React.useState(amountMax);
  const [draftBuckets, setDraftBuckets] = React.useState(buckets);

  React.useEffect(() => {
    setDraftStatuses(statuses);
    setDraftCustomerId(customerId);
    setDraftMin(amountMin);
    setDraftMax(amountMax);
    setDraftBuckets(buckets);
  }, [statuses.join(","), customerId, amountMin, amountMax, buckets.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleStatus(v: string) {
    setDraftStatuses((p) =>
      p.includes(v) ? p.filter((x) => x !== v) : [...p, v]
    );
  }
  function toggleBucket(v: string) {
    setDraftBuckets((p) =>
      p.includes(v) ? p.filter((x) => x !== v) : [...p, v]
    );
  }

  function apply() {
    const params = new URLSearchParams(searchParams);

    if (draftStatuses.length === 0 || draftStatuses.length === STATUS_OPTIONS.length) {
      params.delete("statuses");
    } else {
      params.set("statuses", draftStatuses.join(","));
    }

    if (draftCustomerId) params.set("customerId", draftCustomerId);
    else params.delete("customerId");

    if (draftMin.trim()) params.set("amountMin", draftMin.trim());
    else params.delete("amountMin");

    if (draftMax.trim()) params.set("amountMax", draftMax.trim());
    else params.delete("amountMax");

    if (draftBuckets.length === 0) {
      params.delete("buckets");
    } else {
      params.set("buckets", draftBuckets.join(","));
    }

    setOpen(false);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function clearAll() {
    setDraftStatuses([]);
    setDraftCustomerId("");
    setDraftMin("");
    setDraftMax("");
    setDraftBuckets([]);
    const params = new URLSearchParams(searchParams);
    ["statuses", "customerId", "amountMin", "amountMax", "buckets"].forEach((k) =>
      params.delete(k)
    );
    setOpen(false);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  // Count of "extra" filters in effect (for the chip badge).
  const activeCount =
    (statuses.length > 0 && statuses.length < STATUS_OPTIONS.length ? 1 : 0) +
    (customerId ? 1 : 0) +
    (amountMin ? 1 : 0) +
    (amountMax ? 1 : 0) +
    (buckets.length > 0 ? 1 : 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs font-normal gap-1.5"
          disabled={pending}
        >
          <Plus className="h-3 w-3" />
          More Filters
          {activeCount > 0 ? (
            <span className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
              {activeCount}
            </span>
          ) : null}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3 space-y-3" align="start">
        {/* Status */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Status
          </div>
          <div className="flex flex-wrap gap-1">
            {STATUS_OPTIONS.map((s) => (
              <label
                key={s.value}
                className="flex items-center gap-1 px-2 py-1 rounded border text-xs cursor-pointer hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={draftStatuses.includes(s.value)}
                  onChange={() => toggleStatus(s.value)}
                  className="h-3.5 w-3.5"
                />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Customer */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Customer
          </div>
          <select
            value={draftCustomerId}
            onChange={(e) => setDraftCustomerId(e.target.value)}
            className="w-full h-8 px-2 rounded-md border bg-background text-xs"
          >
            <option value="">All customers</option>
            {customerOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
          {customerName ? (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              Currently: {customerName}
            </p>
          ) : null}
        </div>

        {/* Amount range */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Amount range (₹)
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Min"
              value={draftMin}
              onChange={(e) => setDraftMin(e.target.value)}
              className="h-8 text-xs"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <Input
              type="number"
              placeholder="Max"
              value={draftMax}
              onChange={(e) => setDraftMax(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Bucket */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
            Aging Bucket
          </div>
          <div className="flex flex-wrap gap-1">
            {bucketOptions.map((b) => (
              <label
                key={b}
                className="flex items-center gap-1 px-2 py-1 rounded border text-xs cursor-pointer hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={draftBuckets.includes(b)}
                  onChange={() => toggleBucket(b)}
                  className="h-3.5 w-3.5"
                />
                <span>{b}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t flex justify-between items-center">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={clearAll}
            disabled={pending}
          >
            Clear all
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
      </PopoverContent>
    </Popover>
  );
}
