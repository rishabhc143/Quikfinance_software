"use client";

import * as React from "react";
import { Controller, useFieldArray } from "react-hook-form";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * CRIT-2 audit follow-up: shared Contact-Persons table used by both
 * the Customer form (sales/customers) and the Vendor form
 * (purchases/vendors). Previously each form had its own ~110-LOC
 * inline copy that drifted independently (one used "Add Contact
 * Person" capital P, the other lowercase — that was the visible tell).
 *
 * CURRENT CALLERS (audit r2 verified, do NOT remove):
 *   - app/(dashboard)/sales/customers/customer-form.tsx
 *   - app/(dashboard)/purchases/vendors/vendor-form.tsx
 *
 * If you add a third caller, verify the form's zod schema has
 * `contactPersons: ContactPersonRow[]` (the shape in
 * `lib/validations/contact-shared.ts`). The component's `form` prop
 * is typed `any` because react-hook-form's UseFormReturn<T> is
 * invariant in T — TS can't catch a missing `contactPersons` field
 * at the call site, only at the `useFieldArray` here. Quote /
 * SalesOrder / PurchaseOrder forms intentionally don't use this:
 * they reference contacts by `contactId` FK, not inline.
 *
 * The component owns its own `useFieldArray` so the parent only needs
 * to make sure `form.contactPersons` is defined in the form's default
 * values. The "Primary" radio enforces single-selection across rows
 * by setting every other row's `isPrimary` to false in one
 * `form.setValue` sweep — same behaviour both forms had before.
 *
 * The blank row template lives here too so `Add contact person` can
 * append a consistent shape without the caller re-defining it.
 */

export type ContactPersonRow = {
  salutation?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  workPhone?: string | null;
  mobile?: string | null;
  designation?: string | null;
  department?: string | null;
  isPrimary?: boolean;
};

const blankContactPerson: ContactPersonRow = {
  salutation: "",
  firstName: "",
  lastName: "",
  email: "",
  workPhone: "",
  mobile: "",
  isPrimary: false,
};

// The `form` prop is intentionally typed as `any`. React-hook-form's
// `UseFormReturn<T>` is invariant in `T`, so a CustomerInput form
// type isn't assignable to UseFormReturn<{contactPersons:...}> even
// when CustomerInput has the right shape. Both callers (CustomerForm
// + VendorForm) define `contactPersons` in their zod schemas; if
// either drops it, TypeScript errors at the field-array call site
// here rather than at the call site — but the schemas + Postgres
// columns prevent that drift.
export function ContactPersonsTable({
  form,
  addButtonLabel = "Add contact person",
}: {
  /**
   * The form returned by `useForm`. Must have a
   * `contactPersons: ContactPersonRow[]` field in its values.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  /** Caller can override the CTA label. */
  addButtonLabel?: string;
}) {
  const persons = useFieldArray({
    control: form.control,
    name: "contactPersons",
  });

  return (
    <>
      <div className="rounded-md border bg-background overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-2 text-left">Salutation</th>
              <th className="p-2 text-left">First name</th>
              <th className="p-2 text-left">Last name</th>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Work phone</th>
              <th className="p-2 text-left">Mobile</th>
              <th className="p-2 text-left">Primary</th>
              <th className="w-8 p-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {persons.fields.map((f, i) => (
              <tr key={f.id}>
                <td className="p-2">
                  <Input
                    className="h-8"
                    {...form.register(
                      `contactPersons.${i}.salutation`
                    )}
                  />
                </td>
                <td className="p-2">
                  <Input
                    className="h-8"
                    {...form.register(
                      `contactPersons.${i}.firstName`
                    )}
                  />
                </td>
                <td className="p-2">
                  <Input
                    className="h-8"
                    {...form.register(
                      `contactPersons.${i}.lastName`
                    )}
                  />
                </td>
                <td className="p-2">
                  <Input
                    className="h-8"
                    type="email"
                    {...form.register(`contactPersons.${i}.email`)}
                  />
                </td>
                <td className="p-2">
                  <Input
                    className="h-8"
                    {...form.register(
                      `contactPersons.${i}.workPhone`
                    )}
                  />
                </td>
                <td className="p-2">
                  <Input
                    className="h-8"
                    {...form.register(`contactPersons.${i}.mobile`)}
                  />
                </td>
                <td className="p-2">
                  <Controller
                    name={`contactPersons.${i}.isPrimary`}
                    control={form.control}
                    render={({ field }) => (
                      <input
                        type="radio"
                        name="primaryContactPerson"
                        checked={!!field.value}
                        onChange={() => {
                          persons.fields.forEach((_p, j) =>
                            form.setValue(
                              `contactPersons.${j}.isPrimary`,
                              j === i
                            )
                          );
                        }}
                      />
                    )}
                  />
                </td>
                <td className="p-2">
                  <button
                    type="button"
                    onClick={() => persons.remove(i)}
                    aria-label="Remove contact person"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {persons.fields.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="p-3 text-center text-sm text-muted-foreground"
                >
                  No contact persons yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1"
        onClick={() => persons.append(blankContactPerson)}
      >
        <Plus className="h-4 w-4" /> {addButtonLabel}
      </Button>
    </>
  );
}
