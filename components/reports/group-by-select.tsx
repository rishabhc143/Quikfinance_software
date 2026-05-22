"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

/**
 * RPT-AR-DETAILS — Group By dropdown (client). None / Customer /
 * Bucket / Status. Submits on change.
 */
const OPTIONS: Array<{ value: string; label: string }> = [
  { value: "none", label: "None" },
  { value: "customer", label: "Customer" },
  { value: "bucket", label: "Aging Bucket" },
  { value: "status", label: "Status" },
];

export function GroupBySelect({ groupBy }: { groupBy: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const v = e.target.value;
    const params = new URLSearchParams(searchParams);
    if (v === "none") {
      params.delete("groupBy");
    } else {
      params.set("groupBy", v);
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Group By:</span>
      <select
        value={groupBy}
        onChange={onChange}
        disabled={pending}
        className="h-7 px-1.5 rounded-md border bg-background text-xs disabled:opacity-50"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}
