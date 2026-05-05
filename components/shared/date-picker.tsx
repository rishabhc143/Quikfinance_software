"use client";

import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type DatePickerProps = {
  value: Date | string | null | undefined;
  onChange?: (value: Date | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Display format. ISO yyyy-MM-dd is what server actions expect. */
  format?: string;
};

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  className,
  disabled,
  format: fmt = "dd MMM yyyy",
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const date = toDate(value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn("w-full justify-start font-normal", !date && "text-muted-foreground", className)}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{date ? format(date, fmt) : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <DayPicker
          mode="single"
          selected={date ?? undefined}
          onSelect={(d) => {
            onChange?.(d ?? null);
            setOpen(false);
          }}
          initialFocus
          showOutsideDays
          captionLayout="dropdown"
          fromYear={2000}
          toYear={new Date().getFullYear() + 5}
          className="p-3"
        />
      </PopoverContent>
    </Popover>
  );
}

function toDate(v: Date | string | null | undefined): Date | null {
  if (v == null) return null;
  if (v instanceof Date) return isValid(v) ? v : null;
  // Accept ISO yyyy-MM-dd or full ISO string
  const direct = new Date(v);
  if (isValid(direct)) return direct;
  const iso = parse(v, "yyyy-MM-dd", new Date());
  return isValid(iso) ? iso : null;
}
