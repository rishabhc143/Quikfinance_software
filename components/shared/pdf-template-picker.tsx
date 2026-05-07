"use client";

import * as React from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { Label } from "@/components/ui/label";

/**
 * PDF template picker for transaction forms. Per <quotes_spec> "PDF
 * Template: '<currentTemplate>' Change link → opens template picker
 * modal" — implemented as an inline labeled combobox (simpler UX, same
 * outcome). Templates are pre-loaded server-side and passed in.
 */
export function PdfTemplatePicker({
  templates,
  value,
  onChange,
  label = "PDF Template",
}: {
  templates: ComboboxOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  label?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <Combobox
        options={templates}
        value={value}
        onChange={onChange}
        placeholder="Default template"
      />
    </div>
  );
}
