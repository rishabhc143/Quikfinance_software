"use client";

import * as React from "react";
import {
  HistoryInput,
  type HistoryInputProps,
} from "@/components/ui/history-input";
import {
  lookupPincode,
  type PincodeLookupResult,
} from "@/lib/autofill/pincode";

/**
 * Indian pincode input. Behaves like `<HistoryInput>` but on blur, if the
 * value is a valid 6-digit pincode, hits the free postalpincode.in API to
 * fetch the matching city + state + country. Parent passes an `onResolved`
 * callback to auto-fill those sibling fields.
 *
 * Usage:
 *   <PincodeInput
 *     autofillKey="address.zipCode"
 *     {...form.register(`addresses.${idx}.zipCode`)}
 *     onResolved={(r) => {
 *       form.setValue(`addresses.${idx}.city`, r.city);
 *       form.setValue(`addresses.${idx}.state`, r.state);
 *       form.setValue(`addresses.${idx}.country`, r.country);
 *     }}
 *   />
 *
 * Silent on lookup failure — invalid pincode, no network, no match all
 * resolve to "do nothing." The field stays editable.
 */

export type PincodeInputProps = HistoryInputProps & {
  onResolved?: (result: PincodeLookupResult) => void;
};

export const PincodeInput = React.forwardRef<
  HTMLInputElement,
  PincodeInputProps
>(function PincodeInput({ onResolved, onBlur, ...props }, ref) {
  return (
    <HistoryInput
      {...props}
      ref={ref}
      inputMode="numeric"
      maxLength={6}
      onBlur={(e) => {
        onBlur?.(e);
        const v = e.target.value?.trim();
        if (/^\d{6}$/.test(v) && onResolved) {
          lookupPincode(v)
            .then((result) => {
              if (result) onResolved(result);
            })
            .catch(() => {});
        }
      }}
    />
  );
});
