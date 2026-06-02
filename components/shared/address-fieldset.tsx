"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { HistoryInput } from "@/components/ui/history-input";
import { PincodeInput } from "@/components/ui/pincode-input";

/**
 * CRIT-2 audit follow-up (phase 2): shared Address card used by both
 * the Customer form and the Vendor form. Previously each form had its
 * own ~70-LOC inline copy.
 *
 * CURRENT CALLERS (audit r2 verified, do NOT remove):
 *   - app/(dashboard)/sales/customers/customer-form.tsx
 *   - app/(dashboard)/purchases/vendors/vendor-form.tsx
 *
 * Quote / SalesOrder / PurchaseOrder forms intentionally don't use
 * this: they reference customers/vendors by `contactId` FK rather
 * than capturing inline `addresses[]`. The audit Plan agent C
 * verified this — don't manufacture refactor opportunities here.
 *
 * Real divergences between the two callers are exposed as props
 * rather than internal `if (kind === "vendor")` branches:
 *
 *   - heading           — H3 text ("Billing Address" capital A vs
 *                          "Billing address" lowercase a)
 *   - copyButton        — optional { label, onClick } — only set on
 *                          the shipping card; vendor's label has the
 *                          ↓ arrow prefix
 *   - variant           — "input" (Customer) or "textarea" (Vendor,
 *                          two-row textareas for street lines)
 *   - countryPlaceholder — "Country" vs "Country / Region"
 *   - street1/2 placeholder — "Address line 1/2" vs "Street 1/2"
 *   - zipPlaceholder    — "ZIP" vs "Pin code"
 *
 * The vendor-only amber info alert that lives BELOW the two-card
 * grid stays inline in vendor-form.tsx — it's outside this component's
 * scope, and putting it inside would force every caller to pass an
 * `infoAlert?: React.ReactNode` prop most won't use.
 *
 * Field paths are hard-coded to `addresses.${index}.*` since both
 * callers use that exact shape (per `addressSchema` in
 * `lib/validations/contact-shared.ts`).
 */
export function AddressFieldset({
  form,
  index,
  heading,
  copyButton,
  variant = "input",
  countryPlaceholder = "Country",
  street1Placeholder = "Address line 1",
  street2Placeholder = "Address line 2",
  zipPlaceholder = "ZIP",
}: {
  /** Form returned by `useForm`. See ContactPersonsTable docstring for
   *  why this is typed as `any` — react-hook-form's UseFormReturn<T>
   *  is invariant in T and we'd need to cast at every call site. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  /** Index into the `addresses` field array — caller computes via
   *  `addresses.fields.findIndex((a) => a.kind === kind)`. */
  index: number;
  /** H3 heading shown in the card header. Caller controls casing. */
  heading: string;
  /** When set, renders a "Copy billing address" link button in the
   *  card header — should only be set on the SHIPPING card. */
  copyButton?: { label: string; onClick: () => void };
  /** Whether street1/2 render as `<Input>` (default) or `<Textarea
   *  rows=2>` (Vendor uses this for multi-line street addresses). */
  variant?: "input" | "textarea";
  countryPlaceholder?: string;
  street1Placeholder?: string;
  street2Placeholder?: string;
  zipPlaceholder?: string;
}) {
  return (
    <div className="rounded-md border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold capitalize">{heading}</h3>
        {copyButton ? (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={copyButton.onClick}
          >
            {copyButton.label}
          </Button>
        ) : null}
      </div>
      <Input
        placeholder="Attention"
        {...form.register(`addresses.${index}.attention`)}
      />
      <HistoryInput
        autofillKey="address.country"
        placeholder={countryPlaceholder}
        {...form.register(`addresses.${index}.country`)}
      />
      {variant === "textarea" ? (
        <>
          <Textarea
            placeholder={street1Placeholder}
            rows={2}
            {...form.register(`addresses.${index}.addressLine1`)}
          />
          <Textarea
            placeholder={street2Placeholder}
            rows={2}
            {...form.register(`addresses.${index}.addressLine2`)}
          />
        </>
      ) : (
        <>
          <Input
            placeholder={street1Placeholder}
            {...form.register(`addresses.${index}.addressLine1`)}
          />
          <Input
            placeholder={street2Placeholder}
            {...form.register(`addresses.${index}.addressLine2`)}
          />
        </>
      )}
      <div className="grid gap-2 md:grid-cols-3">
        <HistoryInput
          autofillKey="address.city"
          placeholder="City"
          {...form.register(`addresses.${index}.city`)}
        />
        <HistoryInput
          autofillKey="address.state"
          placeholder="State"
          {...form.register(`addresses.${index}.state`)}
        />
        <PincodeInput
          autofillKey="address.zipCode"
          placeholder={zipPlaceholder}
          {...form.register(`addresses.${index}.zipCode`)}
          onResolved={(r) => {
            form.setValue(`addresses.${index}.city`, r.city);
            form.setValue(`addresses.${index}.state`, r.state);
            form.setValue(`addresses.${index}.country`, r.country);
          }}
        />
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <Input
          placeholder="Phone"
          {...form.register(`addresses.${index}.phone`)}
        />
        <Input
          placeholder="Fax"
          {...form.register(`addresses.${index}.fax`)}
        />
      </div>
    </div>
  );
}
