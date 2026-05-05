"use client";

import * as React from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";

/**
 * Typed wrappers around the generic <Combobox/> primitive. Each receives a
 * pre-fetched set of options from the server (so the server controls the
 * organization-scoped query) and a controlled value/onChange pair.
 */

export type ContactOption = ComboboxOption & {
  email?: string | null;
  companyName?: string | null;
};

export function ContactCombobox({
  options,
  value,
  onChange,
  placeholder = "Select customer…",
}: {
  options: ContactOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
}) {
  return <Combobox options={options} value={value} onChange={onChange} placeholder={placeholder} />;
}

export type ItemOption = ComboboxOption & { rate?: string };
export function ItemCombobox({
  options,
  value,
  onChange,
  placeholder = "Type or click to select an item.",
}: {
  options: ItemOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
}) {
  return <Combobox options={options} value={value} onChange={onChange} placeholder={placeholder} />;
}

export type TaxOption = ComboboxOption & { rate: number };
export function TaxSelect({
  options,
  value,
  onChange,
}: {
  options: TaxOption[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return <Combobox options={options} value={value} onChange={onChange} placeholder="Tax" />;
}

export function SalespersonCombobox({
  options,
  value,
  onChange,
  onCreate,
}: {
  options: ComboboxOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  onCreate?: (name: string) => void | Promise<void>;
}) {
  return (
    <Combobox
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Select salesperson…"
      allowCreate={!!onCreate}
      onCreate={onCreate}
    />
  );
}

export function ProjectCombobox({
  options,
  value,
  onChange,
  disabled,
  placeholder = "Select a customer to associate a project.",
}: {
  options: ComboboxOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return <Combobox options={options} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} />;
}

export function TermsCombobox({
  options,
  value,
  onChange,
}: {
  options: ComboboxOption[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return <Combobox options={options} value={value} onChange={onChange} placeholder="Payment terms" />;
}

export function DeliveryMethodCombobox({
  options,
  value,
  onChange,
  onCreate,
}: {
  options: ComboboxOption[];
  value: string | null;
  onChange: (v: string | null) => void;
  onCreate?: (name: string) => void | Promise<void>;
}) {
  return (
    <Combobox
      options={options}
      value={value}
      onChange={onChange}
      placeholder="Delivery method"
      allowCreate={!!onCreate}
      onCreate={onCreate}
    />
  );
}
