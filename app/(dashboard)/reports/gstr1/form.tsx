"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

export function Gstr1Form({
  defaultMonth,
  defaultYear,
  supplierGstin,
}: {
  defaultMonth: number;
  defaultYear: number;
  supplierGstin: string;
}) {
  const [month, setMonth] = React.useState(defaultMonth);
  const [year, setYear] = React.useState(defaultYear);
  // Show ±3 years around the default for the year picker.
  const years = React.useMemo(() => {
    const arr: number[] = [];
    for (let y = defaultYear - 3; y <= defaultYear + 1; y++) arr.push(y);
    return arr;
  }, [defaultYear]);

  const href = `/api/reports/gstr1?month=${month}&year=${year}`;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Month
        </label>
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={month}
          onChange={(e) => setMonth(parseInt(e.target.value, 10))}
        >
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          Year
        </label>
        <select
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value, 10))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <div className="ml-auto text-xs text-muted-foreground">
        Supplier GSTIN:{" "}
        <code className="font-mono">{supplierGstin}</code>
      </div>
      <Button asChild className="gap-1">
        <a href={href} download>
          <Download className="h-4 w-4" /> Download JSON
        </a>
      </Button>
    </div>
  );
}
