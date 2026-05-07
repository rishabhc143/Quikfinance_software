"use client";

import * as React from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ENTITY_TYPE_URL,
  type CustomFieldDataType,
} from "@/lib/sales/custom-fields";

/**
 * M17c: Reusable Custom Fields renderer for transaction forms (Invoice
 * first, Quote/SO/etc. follow). Each form passes the active
 * definitions for its entityType + the current value map; this
 * component renders the inputs and emits onChange with a fresh map.
 *
 * Storage: each form's save action persists `values` via
 * `setCustomFieldValuesAction({ entityType, entityId, values })`.
 *
 * Renders nothing when there are no active definitions — keeps the
 * form clean for orgs that haven't configured custom fields.
 */

export type CustomFieldDefForRender = {
  id: string;
  fieldKey: string;
  label: string;
  dataType: CustomFieldDataType;
  options: { label: string; value: string }[] | null;
  isRequired: boolean;
};

export type CustomFieldValueMap = Record<string, unknown>;

export function CustomFieldsSection({
  entityType,
  definitions,
  values,
  onChange,
  defaultOpen = false,
}: {
  entityType: string;
  definitions: CustomFieldDefForRender[];
  values: CustomFieldValueMap;
  onChange: (next: CustomFieldValueMap) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  if (definitions.length === 0) return null;

  function setValue(id: string, v: unknown) {
    onChange({ ...values, [id]: v });
  }

  const urlSlug = ENTITY_TYPE_URL[entityType] ?? entityType.toLowerCase();

  return (
    <section className="rounded-md border bg-background">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium hover:bg-muted/30"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          Custom Fields ({definitions.length})
        </span>
        <Link
          href={`/settings/preferences/${urlSlug}/custom-fields`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          Manage <ExternalLink className="h-3 w-3" />
        </Link>
      </button>
      {open ? (
        <div className="border-t p-4 space-y-3">
          {definitions.map((d) => (
            <FieldRow
              key={d.id}
              def={d}
              value={values[d.id]}
              onChange={(v) => setValue(d.id, v)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function FieldRow({
  def,
  value,
  onChange,
}: {
  def: CustomFieldDefForRender;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `cf-${def.id}`;
  const labelEl = (
    <Label htmlFor={id} className="text-sm">
      {def.label}
      {def.isRequired ? <span className="text-destructive ml-1">*</span> : null}
    </Label>
  );

  if (def.dataType === "checkbox") {
    return (
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
        {labelEl}
      </div>
    );
  }

  if (def.dataType === "dropdown") {
    return (
      <div className="space-y-1">
        {labelEl}
        <select
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-10 w-full rounded border px-2 bg-background text-sm"
        >
          <option value="">—</option>
          {(def.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  const inputType =
    def.dataType === "number"
      ? "number"
      : def.dataType === "date"
      ? "date"
      : def.dataType === "email"
      ? "email"
      : def.dataType === "url"
      ? "url"
      : "text";

  return (
    <div className="space-y-1">
      {labelEl}
      <Input
        id={id}
        type={inputType}
        value={
          value === null || value === undefined
            ? ""
            : typeof value === "string" || typeof value === "number"
            ? String(value)
            : ""
        }
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
