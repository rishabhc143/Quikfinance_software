"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Currency-aware numeric input. Always emits a stringified value to avoid
 * float-precision loss; downstream zod parsing converts to Decimal.
 *
 * The visible mask groups thousands and limits to 4 decimal places, but the
 * underlying form value is the raw string the user typed (with grouping
 * stripped) — so server actions can parse it directly without locale issues.
 */
export type MoneyInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "defaultValue"
> & {
  value: string | number | null | undefined;
  onChange?: (value: string) => void;
  currencyCode?: string;
  allowNegative?: boolean;
};

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput(
    { value, onChange, currencyCode, allowNegative, className, ...rest },
    ref
  ) {
    const display = formatDisplay(value);
    return (
      <div className={cn("relative flex items-center", className)}>
        {currencyCode ? (
          <span className="pointer-events-none absolute left-3 text-sm text-muted-foreground">
            {currencyCode}
          </span>
        ) : null}
        <input
          ref={ref}
          inputMode="decimal"
          type="text"
          value={display}
          onChange={(e) => {
            const raw = sanitize(e.target.value, allowNegative ?? false);
            onChange?.(raw);
          }}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-right shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            currencyCode && "pl-12"
          )}
          {...rest}
        />
      </div>
    );
  }
);

function sanitize(input: string, allowNegative: boolean): string {
  let s = input.replace(/[^\d.\-]/g, "");
  if (!allowNegative) s = s.replace(/-/g, "");
  // collapse multiple negatives, dots
  s = s.replace(/-+/g, (m) => (m.length > 0 ? "-" : ""));
  s = s.replace(/(\..*)\./g, "$1");
  // Restrict to 4 decimal places
  const m = s.match(/^(-?\d*)(?:\.(\d{0,4})\d*)?/);
  if (!m) return s;
  return m[2] !== undefined ? `${m[1]}.${m[2]}` : m[1];
}

function formatDisplay(value: string | number | null | undefined): string {
  if (value == null) return "";
  return String(value);
}
